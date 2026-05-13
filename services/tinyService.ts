
const TINY_API_KEY = "ziw4kfelhofucgrab0ueghdsi13jepgmny2ygoqlm7l9fzbp";
const TINY_API_URL = `https://api.tiny.cloud/1/${TINY_API_KEY}`;

export const tinyService = {
  async saveNote(content: string) {
    try {
      // Note: This is a template service as requested by the user.
      // In a real scenario, you would replace YOUR_API_KEY with a real key
      // and ensure the endpoint exists.
      const res = await fetch(`${TINY_API_URL}/notes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ content })
      });

      if (!res.ok) throw new Error("Erro ao salvar nota no Tiny Cloud");

      return await res.json();
    } catch (err) {
      console.error("Tiny save error:", err);
      throw err;
    }
  },

  async getNote(noteId: string) {
    try {
      const res = await fetch(`${TINY_API_URL}/notes/${noteId}`);
      if (!res.ok) throw new Error("Erro ao buscar nota no Tiny Cloud");
      return await res.json();
    } catch (err) {
      console.error("Tiny fetch error:", err);
      throw err;
    }
  }
};
