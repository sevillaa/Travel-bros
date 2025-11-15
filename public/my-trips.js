document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("my-trips-form");
  const resultBox = document.getElementById("my-trips-result");
  const tripsList = document.getElementById("trips-list");

  const editSection = document.getElementById("edit-section");
  const editInfo = document.getElementById("edit-trip-info");
  const editForm = document.getElementById("edit-trip-form");
  const editYesInput = document.getElementById("editYes");
  const editNoInput = document.getElementById("editNo");
  const deleteBtn = document.getElementById("delete-trip-btn");

  let currentEmail = null;
  let selected = null; // { code, participantId }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("myEmail").value.trim();
    if (!email) {
      alert("Introduce tu email");
      return;
    }
    currentEmail = email;
    await loadTrips(email);
  });

  async function loadTrips(email) {
    resultBox.hidden = false;
    resultBox.textContent = "Buscando viajes...";
    tripsList.innerHTML = "";
    tripsList.hidden = true;
    editSection.hidden = true;

    try {
      const res = await fetch(`/api/users/${encodeURIComponent(email)}/trips`);
      const data = await res.json();

      if (!res.ok || !data.ok) {
        resultBox.textContent = data.message || "Error al buscar viajes.";
        return;
      }

      if (data.trips.length === 0) {
        resultBox.textContent = "No tienes viajes asociados a este email.";
        return;
      }

      resultBox.textContent = "Selecciona un viaje para editar o darte de baja:";
      renderTrips(data.trips);
    } catch (err) {
      console.error(err);
      resultBox.textContent = "Error de conexión con el servidor.";
    }
  }

  function renderTrips(trips) {
    tripsList.innerHTML = "";
    trips.forEach((t) => {
      const li = document.createElement("li");
      li.innerHTML = `
        Código: <strong>${t.code}</strong> · Fecha votación: ${t.votingDate || "-"} · Nombre: ${t.name}
        `;
      const btn = document.createElement("button");
      btn.textContent = "Editar";
      btn.className = "btn btn-outline small-btn";
      btn.addEventListener("click", () => selectTrip(t));
      li.appendChild(document.createElement("br"));
      li.appendChild(btn);
      tripsList.appendChild(li);
    });
    tripsList.hidden = false;
  }

  function selectTrip(t) {
    selected = { code: t.code, participantId: t.participantId };
    editInfo.textContent = `Viaje ${t.code} · tu nombre: ${t.name}`;
    editSection.hidden = false;

    // Cargar datos actuales del participante
    fetch(`/api/trips/${t.code}`)
      .then((res) => res.json())
      .then((data) => {
        if (!data.ok) return;
        const participant = data.trip.participants.find(
          (p) => p.id === t.participantId
        );
        if (!participant) return;

        editYesInput.value = (participant.choices?.yes || []).join(", ");
        editNoInput.value = (participant.choices?.no || []).join(", ");
      })
      .catch((err) => console.error(err));
  }

  // Guardar cambios
  editForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!selected) return;

    const yesList = editYesInput.value
      .split(",")
      .map((d) => d.trim())
      .filter((d) => d !== "");
    const noList = editNoInput.value
      .split(",")
      .map((d) => d.trim())
      .filter((d) => d !== "");

    try {
      const res = await fetch(
        `/api/trips/${selected.code}/participants/${selected.participantId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            choicesYes: yesList,
            choicesNo: noList
          })
        }
      );

      const data = await res.json();
      if (!res.ok || !data.ok) {
        alert(data.message || "Error al actualizar tu participación.");
        return;
      }

      alert("Cambios guardados.");
      await loadTrips(currentEmail);
    } catch (err) {
      console.error(err);
      alert("Error de conexión con el servidor.");
    }
  });

  // Darme de baja
  deleteBtn.addEventListener("click", async () => {
    if (!selected) return;
    if (!confirm("¿Seguro que quieres salir de este viaje?")) return;

    try {
      const res = await fetch(
        `/api/trips/${selected.code}/participants/${selected.participantId}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (!res.ok || !data.ok) {
        alert(data.message || "Error al darte de baja.");
        return;
      }

      alert("Te has dado de baja del viaje.");
      editSection.hidden = true;
      await loadTrips(currentEmail);
    } catch (err) {
      console.error(err);
      alert("Error de conexión con el servidor.");
    }
  });
});
