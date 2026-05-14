async function fetchMessages() {
  const url = "https://pseudolegal-chelsey-tacitly.ngrok-free.dev/api/default/chats";
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json",
    "X-Api-Key": "62220aa7d8194421ac785a3ebea6c5fb"
  };

  try {
    const res = await fetch(url, { headers });
    const chats = await res.json();
    console.log(chats.map(c => ({ id: c.id._serialized || c.id, messages: c.messages })));
  } catch (error) {
    console.error("Error fetching", error.message);
  }
}

fetchMessages();
