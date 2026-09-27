// Función serverless (Vercel) — capa de modelo de lenguaje del DSS.
// Recibe los datos YA integrados por la página (4 dimensiones + resultado de las reglas)
// y le pide a Gemini que redacte la recomendación, indicando la fuente de cada afirmación.
// La clave de Gemini se lee de la variable de entorno GEMINI_API_KEY (configurada en Vercel),
// por lo que nunca aparece en el código ni en GitHub.

const MODELO_POR_DEFECTO = 'gemini-3.5-flash';
const DIMENSIONES = ['ambiental', 'territorial', 'patrimonial', 'humana', 'reglas'];

const INSTRUCCIONES = `Eres el componente de redacción de un Sistema de Apoyo a la Toma de Decisiones (DSS) para expediciones de turismo de naturaleza en Chile.
Recibes datos ya recopilados de cuatro dimensiones (ambiental, territorial, patrimonial y humana) y el resultado de un sistema de reglas (puntajes, dimensión más débil y medidas de mitigación).

Tu tarea: redactar una recomendación breve y clara para el guía o planificador de la expedición.

Reglas obligatorias:
1. Usa SOLO los datos entregados. No inventes cifras, especies, horarios ni condiciones. Si un dato no está, no lo supongas.
2. Copia los valores numéricos tal como vienen (por ejemplo, no conviertas un promedio en un máximo).
3. Cada afirmación debe indicar su dimensión de origen (ambiental, territorial, patrimonial, humana o reglas) y el dato exacto que la respalda.
4. Cruza las dimensiones: explica cómo un dato cambia de significado según el perfil del grupo.
5. No decidas si la expedición se realiza o no. La decisión es siempre del guía o planificador; tú solo entregas elementos para decidir.
6. Escribe en español de Chile, en tono profesional y directo. Entre 4 y 7 afirmaciones.`;

const ESQUEMA = {
  type: 'OBJECT',
  properties: {
    sintesis: { type: 'STRING', description: 'Dos frases que resumen el escenario para el guía.' },
    afirmaciones: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          texto: { type: 'STRING', description: 'Una afirmación o recomendación concreta.' },
          dimension: { type: 'STRING', enum: DIMENSIONES },
          dato_fuente: { type: 'STRING', description: 'El dato exacto recibido que respalda la afirmación.' }
        },
        required: ['texto', 'dimension', 'dato_fuente']
      }
    },
    nota_para_el_guia: { type: 'STRING', description: 'Recordatorio breve de que la decisión final es del guía.' }
  },
  required: ['sintesis', 'afirmaciones', 'nota_para_el_guia']
};

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método no permitido' });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: 'La capa de IA no está configurada (falta GEMINI_API_KEY).' });
    return;
  }
  const modelo = process.env.GEMINI_MODEL || MODELO_POR_DEFECTO;

  let datos = req.body;
  if (typeof datos === 'string') {
    try { datos = JSON.parse(datos); } catch (e) { datos = null; }
  }
  if (!datos || typeof datos !== 'object' || !datos.ruta || !datos.reglas) {
    res.status(400).json({ error: 'Datos del escenario incompletos.' });
    return;
  }
  const datosTexto = JSON.stringify(datos, null, 2);
  if (datosTexto.length > 20000) {
    res.status(413).json({ error: 'Datos demasiado extensos.' });
    return;
  }

  const cuerpo = {
    systemInstruction: { parts: [{ text: INSTRUCCIONES }] },
    contents: [{
      role: 'user',
      parts: [{ text: 'Datos integrados del escenario (JSON):\n' + datosTexto }]
    }],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: 'application/json',
      responseSchema: ESQUEMA
    }
  };

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelo)}:generateContent`;
    const respuesta = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(cuerpo)
    });
    const json = await respuesta.json();

    if (!respuesta.ok) {
      const detalle = (json && json.error && json.error.message) || `HTTP ${respuesta.status}`;
      res.status(502).json({ error: 'Gemini devolvió un error: ' + detalle });
      return;
    }

    const texto = json?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
    let resultado;
    try {
      resultado = JSON.parse(texto.replace(/^```(?:json)?\s*|\s*```$/g, ''));
    } catch (e) {
      res.status(502).json({ error: 'La respuesta del modelo no tuvo el formato esperado.' });
      return;
    }

    const afirmaciones = Array.isArray(resultado.afirmaciones) ? resultado.afirmaciones : [];
    res.status(200).json({
      modelo,
      sintesis: String(resultado.sintesis || ''),
      afirmaciones: afirmaciones.slice(0, 10).map(a => ({
        texto: String(a.texto || ''),
        dimension: DIMENSIONES.includes(a.dimension) ? a.dimension : 'reglas',
        dato_fuente: String(a.dato_fuente || '')
      })),
      nota_para_el_guia: String(resultado.nota_para_el_guia || '')
    });
  } catch (error) {
    res.status(502).json({ error: 'No fue posible conectar con Gemini.' });
  }
};
