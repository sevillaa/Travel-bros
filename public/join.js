document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("join-trip-form");
  const result = document.getElementById("join-result");
  const passengerList = document.getElementById("passenger-list");
  const fileInput = document.getElementById("presentationFile");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const codeInput = document.getElementById("tripCode");
    const emailInput = document.getElementById("email");
    const nameInput = document.getElementById("participantName");
    const yesInput = document.getElementById("yesDestinations");
    const noInput = document.getElementById("noDestinations");

    const code = codeInput.value.trim().toUpperCase();
    const email = emailInput.value.trim();
    const name = nameInput.value.trim();

    if (!code || !name || !email) {
      alert("Introduce código de viaje, nombre y email.");
      return;
    }

    // Procesar listas de destinos desde el input (separados por comas)
    const yesNames = yesInput.value
      .split(",")
      .map((d) => d.trim())
      .filter((d) => d !== "");

    const noNames = noInput.value
      .split(",")
      .map((d) => d.trim())
      .filter((d) => d !== "");

    try {
      // 1) Unirse al viaje (nombre + email + destinos)
      const res = await fetch(`/api/trips/${code}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          choicesYes: yesNames,
          choicesNo: noNames
        })
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        result.textContent = data.message || "Error al unirse al viaje";
        result.classList.add("error");
        result.hidden = false;
        passengerList.hidden = true;
        return;
      }

      result.classList.remove("error");
      result.innerHTML = `Te has unido al viaje <strong>${code}</strong> como <strong>${name}</strong>.`;
      result.hidden = false;

      // 2) Si hay fichero, subir presentación
      const participantId = data.participantId;
      if (fileInput.files.length > 0 && participantId) {
        const formData = new FormData();
        formData.append("presentation", fileInput.files[0]);

        const uploadRes = await fetch(
          `/api/trips/${code}/participants/${participantId}/presentation`,
          {
            method: "POST",
            body: formData
          }
        );

        const uploadData = await uploadRes.json();
        if (!uploadRes.ok || !uploadData.ok) {
          console.error("Error al subir la presentación:", uploadData);
        } else {
          console.log("Presentación subida:", uploadData.file);
        }
      }

      // 3) Pintar la lista de pasajeros
      passengerList.innerHTML = "";
      data.trip.participants.forEach((p) => {
        const li = document.createElement("li");
        const estado = p.assigned ? "✅ asignado" : "⏳ libre";
        li.textContent = `${p.name} (${estado})`;
        passengerList.appendChild(li);
      });
      passengerList.hidden = false;

    } catch (err) {
      console.error(err);
      result.textContent = "Error de conexión con el servidor";
      result.classList.add("error");
      result.hidden = false;
      passengerList.hidden = true;
    }
  });
});

