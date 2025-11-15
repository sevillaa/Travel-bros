document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("create-trip-form");
  const addParticipantBtn = document.getElementById("add-participant");
  const participantsList = document.getElementById("participants-list");
  const resultBox = document.getElementById("create-result");
  const tripCodeSpan = document.getElementById("trip-code");
  const copyBtn = document.getElementById("copy-code-btn");

  // Añadir nuevo campo de participante
  addParticipantBtn.addEventListener("click", () => {
    const input = document.createElement("input");
    input.type = "text";
    input.name = "participants[]";
    input.placeholder = "Nombre del participante";
    participantsList.appendChild(input);
  });

  // Enviar formulario -> llama a la API /api/trips
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const votingDate = document.getElementById("votingDate").value;
    const participantInputs = participantsList.querySelectorAll(
      'input[name="participants[]"]'
    );

    const participantNames = [];
    participantInputs.forEach((input) => {
      const name = input.value.trim();
      if (name !== "") {
        participantNames.push(name);
      }
    });

    const maxYesPerUser = document.getElementById("maxYesPerUser").value;
    const maxNoPerUser = document.getElementById("maxNoPerUser").value;

    if (!votingDate || participantNames.length === 0) {
      alert("Pon una fecha de votación y al menos un participante.");
      return;
    }

    try {
      const res = await fetch("/api/trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          votingDate,
          participants: participantNames,
          maxYesPerUser,
          maxNoPerUser
        })
      });

      const data = await res.json();

      if (!data.ok) {
        alert(data.message || "Error al crear el viaje");
        return;
      }

      // Mostrar el código generado por el servidor
      tripCodeSpan.textContent = data.code;
      resultBox.hidden = false;

      if (copyBtn) {
        copyBtn.onclick = () => {
          navigator.clipboard
            .writeText(data.code)
            .then(() => alert("Código copiado al portapapeles"))
            .catch(() => alert("No se pudo copiar el código"));
        };
      }

      console.log("Viaje creado:", data.trip);
    } catch (err) {
      console.error(err);
      alert("Error de conexión con el servidor");
    }
  });
});

