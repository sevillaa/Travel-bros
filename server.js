const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");

const app = express();
const PORT = process.env.PORT || 3000;

// Ruta al fichero JSON donde guardaremos los viajes
const DATA_FILE = path.join(__dirname, "trips.json");

// Carpeta para subir presentaciones
const UPLOADS_DIR = path.join(__dirname, "uploads");
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR);
}

// Configuración de multer para guardar ficheros
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const { code, participantId } = req.params;
    const ext = path.extname(file.originalname) || "";
    const safeCode = (code || "UNKNOWN").toUpperCase();
    cb(null, `${safeCode}_${participantId}${ext}`);
  }
});
const upload = multer({ storage });

// Middleware para leer JSON del body
app.use(express.json());

// Servir archivos estáticos (tu web) desde /public
app.use(express.static(path.join(__dirname, "public")));

// Servir las presentaciones
app.use("/uploads", express.static(UPLOADS_DIR));

// --------- Funciones auxiliares ---------

function loadTrips() {
  if (!fs.existsSync(DATA_FILE)) {
    return { trips: [] };
  }
  const raw = fs.readFileSync(DATA_FILE, "utf8");
  if (!raw.trim()) {
    return { trips: [] };
  }
  return JSON.parse(raw);
}

function saveTrips(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
}

// Generar código único de viaje
function generateTripCode(length, existingCodes) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sin 0,1,I,O
  let code = "";
  let tries = 0;

  do {
    code = "";
    for (let i = 0; i < length; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    tries++;
    // si se repite, vuelve a generar (muy poco probable)
  } while (existingCodes.has(code) && tries < 5);

  return code;
}

// --------- API: crear viaje ---------

app.post("/api/trips", (req, res) => {
  const { votingDate, participants, maxYesPerUser, maxNoPerUser } = req.body;

  // Validaciones básicas
  if (!votingDate || !Array.isArray(participants) || participants.length === 0) {
    return res.status(400).json({
      ok: false,
      message: "Se requiere fecha de votación y al menos un participante"
    });
  }

  const data = loadTrips();
  const existingCodes = new Set(data.trips.map((t) => t.code));

  const code = generateTripCode(6, existingCodes);
  const now = new Date().toISOString();

  // Configuración del viaje (límites por usuario)
  const maxYes = parseInt(maxYesPerUser, 10);
  const maxNo = parseInt(maxNoPerUser, 10);

  const config = {
    maxYesPerUser: Number.isNaN(maxYes) ? null : maxYes,
    maxNoPerUser: Number.isNaN(maxNo) ? null : maxNo
  };

  // Convertir nombres simples en objetos de participante
  const participantObjects = participants.map((name, index) => ({
    id: "p" + (index + 1),
    name,
    email: null,
    joinedAt: now,
    isAdmin: index === 0, // el primero admin
    assigned: false,      // nadie asignado aún
    choices: {
      yes: [],
      no: []
    },
    presentationFile: null
  }));

  const trip = {
    code,
    votingDate,
    createdAt: now,
    admin: {
      name: participantObjects[0].name,
      email: null
    },
    config,
    participants: participantObjects
  };

  data.trips.push(trip);
  saveTrips(data);

  return res.status(201).json({
    ok: true,
    code,
    trip
  });
});

// --------- API: ver viaje por código ---------

app.get("/api/trips/:code", (req, res) => {
  const { code } = req.params;
  const data = loadTrips();
  const trip = data.trips.find((t) => t.code === code.toUpperCase());

  if (!trip) {
    return res.status(404).json({ ok: false, message: "Viaje no encontrado" });
  }

  return res.json({ ok: true, trip });
});

// --------- API: unirse a un viaje (nombre + destinos libres) ---------
app.post("/api/trips/:code/join", (req, res) => {
  const { code } = req.params;
  const { name, email, choicesYes, choicesNo } = req.body || {};

  if (!name || !name.trim() || !email || !email.trim()) {
    return res.status(400).json({ ok: false, message: "Nombre y email requeridos" });
  }

  const trimmedName = name.trim();
  const trimmedEmail = email.trim().toLowerCase();

  const data = loadTrips();
  const idx = data.trips.findIndex((t) => t.code === code.toUpperCase());

  if (idx === -1) {
    return res.status(404).json({ ok: false, message: "Viaje no encontrado" });
  }

  const now = new Date().toISOString();
  const trip = data.trips[idx];

  // Normalizar participantes (por si hay viajes antiguos)
  trip.participants = trip.participants.map((p, i) => ({
    id: p.id || "p" + (i + 1),
    name: p.name,
    email: p.email || null,
    joinedAt: p.joinedAt || now,
    isAdmin: !!p.isAdmin,
    assigned: p.assigned ?? false,
    choices: p.choices || { yes: [], no: [] },
    presentationFile: p.presentationFile || null
  }));

  // ¿Ya hay alguien con este email?
  const participantByEmail = trip.participants.find(
    (p) => p.email && p.email.toLowerCase() === trimmedEmail
  );

  if (participantByEmail && participantByEmail.assigned) {
    return res
      .status(400)
      .json({ ok: false, message: "Este email ya está asociado a un pasajero en este viaje" });
  }

  let participant = participantByEmail;

  // Si no hay por email, intentamos emparejar por nombre SIN email (slots creados al crear el viaje)
  if (!participant) {
    participant = trip.participants.find(
      (p) => !p.email && p.name.toLowerCase() === trimmedName.toLowerCase()
    );
  }

  if (!participant) {
    // No existía -> creamos uno nuevo y lo marcamos asignado
    participant = {
      id: "p" + (trip.participants.length + 1),
      name: trimmedName,
      email: email.trim(),
      joinedAt: now,
      isAdmin: false,
      assigned: true,
      choices: { yes: [], no: [] },
      presentationFile: null
    };
    trip.participants.push(participant);
  } else {
    // Slot existente -> lo "reclama" este email
    participant.name = trimmedName;
    participant.email = email.trim();
    participant.assigned = true;
    participant.joinedAt = now;
  }

  // Procesar listas de destinos (libres, sin catálogo fijo)
  const yesList = Array.isArray(choicesYes)
    ? choicesYes.map((d) => d.trim()).filter((d) => d !== "")
    : [];

  const noList = Array.isArray(choicesNo)
    ? choicesNo.map((d) => d.trim()).filter((d) => d !== "")
    : [];

  const maxYes = trip.config?.maxYesPerUser;
  const maxNo = trip.config?.maxNoPerUser;

  if (typeof maxYes === "number" && yesList.length > maxYes) {
    return res.status(400).json({
      ok: false,
      message: `Solo puedes seleccionar hasta ${maxYes} destinos que quieres`
    });
  }

  if (typeof maxNo === "number" && noList.length > maxNo) {
    return res.status(400).json({
      ok: false,
      message: `Solo puedes seleccionar hasta ${maxNo} destinos que NO quieres`
    });
  }

  participant.choices = {
    yes: yesList,
    no: noList
  };

  data.trips[idx] = trip;
  saveTrips(data);

  return res.json({ ok: true, trip, participantId: participant.id });
});

// --------- API: subir presentación de un participante ---------

app.post(
  "/api/trips/:code/participants/:participantId/presentation",
  upload.single("presentation"),
  (req, res) => {
    const { code, participantId } = req.params;

    if (!req.file) {
      return res
        .status(400)
        .json({ ok: false, message: "No se ha recibido ningún archivo" });
    }

    const data = loadTrips();
    const idx = data.trips.findIndex((t) => t.code === code.toUpperCase());

    if (idx === -1) {
      return res.status(404).json({ ok: false, message: "Viaje no encontrado" });
    }

    const trip = data.trips[idx];
    const participant = trip.participants.find((p) => p.id === participantId);

    if (!participant) {
      return res
        .status(404)
        .json({ ok: false, message: "Participante no encontrado" });
    }

    // Guardamos la ruta relativa del archivo
    participant.presentationFile = `/uploads/${req.file.filename}`;

    data.trips[idx] = trip;
    saveTrips(data);

    return res.json({
      ok: true,
      message: "Presentación subida correctamente",
      file: participant.presentationFile
    });
  }
);

// --------- Arrancar servidor ---------

app.listen(PORT, () => {
  console.log(`Servidor Travel Bros escuchando en http://localhost:${PORT}`);
});

// --------- API: viajes de un usuario por email ---------

app.get("/api/users/:email/trips", (req, res) => {
  const emailParam = req.params.email;
  const email = emailParam.toLowerCase();

  const data = loadTrips();
  const trips = [];

  data.trips.forEach((trip) => {
    trip.participants.forEach((p) => {
      if (p.email && p.email.toLowerCase() === email) {
        trips.push({
          code: trip.code,
          votingDate: trip.votingDate,
          createdAt: trip.createdAt,
          participantId: p.id,
          name: p.name
        });
      }
    });
  });

  return res.json({ ok: true, trips });
});


// --------- API: actualizar participación de un usuario ---------

app.put("/api/trips/:code/participants/:participantId", (req, res) => {
  const { code, participantId } = req.params;
  const { choicesYes, choicesNo, name } = req.body || {};

  const data = loadTrips();
  const idx = data.trips.findIndex((t) => t.code === code.toUpperCase());
  if (idx === -1) {
    return res.status(404).json({ ok: false, message: "Viaje no encontrado" });
  }

  const trip = data.trips[idx];
  const participant = trip.participants.find((p) => p.id === participantId);

  if (!participant) {
    return res.status(404).json({ ok: false, message: "Participante no encontrado" });
  }

  const yesList = Array.isArray(choicesYes)
    ? choicesYes.map((d) => d.trim()).filter((d) => d !== "")
    : [];

  const noList = Array.isArray(choicesNo)
    ? choicesNo.map((d) => d.trim()).filter((d) => d !== "")
    : [];

  const maxYes = trip.config?.maxYesPerUser;
  const maxNo = trip.config?.maxNoPerUser;

  if (typeof maxYes === "number" && yesList.length > maxYes) {
    return res.status(400).json({
      ok: false,
      message: `Solo puedes seleccionar hasta ${maxYes} destinos que quieres`
    });
  }

  if (typeof maxNo === "number" && noList.length > maxNo) {
    return res.status(400).json({
      ok: false,
      message: `Solo puedes seleccionar hasta ${maxNo} destinos que NO quieres`
    });
  }

  participant.choices = { yes: yesList, no: noList };

  if (name && name.trim()) {
    participant.name = name.trim();
  }

  data.trips[idx] = trip;
  saveTrips(data);

  return res.json({ ok: true, trip, participant });
});

// --------- API: eliminar participación de un usuario ---------

app.delete("/api/trips/:code/participants/:participantId", (req, res) => {
  const { code, participantId } = req.params;

  const data = loadTrips();
  const idx = data.trips.findIndex((t) => t.code === code.toUpperCase());
  if (idx === -1) {
    return res.status(404).json({ ok: false, message: "Viaje no encontrado" });
  }

  const trip = data.trips[idx];
  const before = trip.participants.length;
  trip.participants = trip.participants.filter((p) => p.id !== participantId);

  if (trip.participants.length === before) {
    return res.status(404).json({ ok: false, message: "Participante no encontrado" });
  }

  data.trips[idx] = trip;
  saveTrips(data);

  return res.json({ ok: true });
});
