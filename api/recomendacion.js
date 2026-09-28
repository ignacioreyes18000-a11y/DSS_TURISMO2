// Función serverless (Vercel) — capa de modelo de lenguaje del DSS.
// Recibe los datos YA integrados por la página (4 dimensiones + resultado de las reglas)
// y le pide a Gemini que redacte la recomendación, indicando la fuente de cada afirmación.
// La clave de Gemini se lee de la variable de entorno GEMINI_API_KEY (configurada en Vercel),
// por lo que nunca aparece en el código ni en GitHub.

// Modelos a intentar en orden. Si uno está saturado o no disponible, se prueba el siguiente.
// Se puede fijar otra lista con la variable de entorno GEMINI_MODEL (separados por coma).
const MODELOS_POR_DEFECTO = ['gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.7-flash'];
const TIEMPO_MAX_POR_INTENTO_MS = 12000;
const TIEMPO_MAX_TOTAL_MS = 25000;
const DIMENSIONES = ['ambiental', 'territorial', 'patrimonial', 'humana', 'reglas'];

const INSTRUCCIONES = `Eres el componente de redacción de un Sistema de Apoyo a la Toma de Decisiones (DSS) para expediciones de turismo de naturaleza en Chile.
Recibes datos ya recopilados de cuatro dimensiones (ambiental, territorial, patrimonial y humana) y el resultado de un sistema de reglas (puntajes, dimensión más débil y medidas de mitigación).

Tu tarea: redactar una recomendación breve y clara para el guía o planificador de la expedición.

Reglas obligatorias:
1. Usa SOLO los datos entregados. No inventes cifras, especies, horarios ni condiciones. Si un dato no está, no lo supongas.
2. Copia los valores numéricos tal como vienen (por ejemplo, no conviertas un promedio en un máximo).
3. Cada afirmación debe ser una recomendación o advertencia ACCIONABLE para el guía o planificador (qué hacer, qué verificar o qué preparar), no una simple repetición de datos. Evita frases vagas como "condiciones que varían en su exigencia".
4. Cruza las dimensiones: en la mayoría de las afirmaciones combina al menos dos datos de dimensiones distintas y explica por qué juntos importan. Ejemplos del tipo de cruce esperado: persona sola + ruta sin refugios → dar aviso de la salida a un tercero; principiante + desnivel → ritmo y puntos de retorno; salida temprano + temperatura baja → abrigo; ruta sin agua → cantidad de agua.
5. Un tamaño de grupo de 1 significa que la persona realiza la actividad en solitario: considéralo explícitamente.
6. Considera también los refugios, los cierres o restricciones de acceso de la ruta, el horario de salida y el equipo faltante cuando sean relevantes.
7. Sobre biodiversidad: los datos de GBIF son registros de ocurrencia y pueden incluir especies introducidas o exóticas. No afirmes que una especie es nativa, endémica o "patrimonio" salvo que el dato lo indique. Destaca especies con categoría de amenaza UICN si las hay; si no, usa los registros solo para recomendar conductas de bajo impacto (por ejemplo, permanecer en el sendero).
8. En "dimension" indica la dimensión PRINCIPAL de la afirmación; en "dato_fuente" cita todos los datos exactos usados, aunque sean de más de una dimensión.
9. No decidas si la expedición se realiza o no. La decisión es siempre del guía o planificador; tú solo entregas elementos para decidir.
10. Escribe en español de Chile, en tono profesional y directo. Entre 4 y 6 afirmaciones.`;

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
  const modelos = process.env.GEMINI_MODEL
    ? process.env.GEMINI_MODEL.split(',').map(m => m.trim()).filter(Boolean)
    : MODELOS_POR_DEFECTO;

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

  const inicio = Date.now();
  const errores = [];

  for (const modelo of modelos) {
    const restante = TIEMPO_MAX_TOTAL_MS - (Date.now() - inicio);
    if (restante < 3000) break;

    const control = new AbortController();
    const temporizador = setTimeout(() => control.abort(), Math.min(TIEMPO_MAX_POR_INTENTO_MS, restante));
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelo)}:generateContent`;
      const respuesta = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify(cuerpo),
        signal: control.signal
      });
      let json = null;
      try { json = await respuesta.json(); } catch (e) { json = null; }

      if (!respuesta.ok) {
        const detalle = (json && json.error && json.error.message) || `HTTP ${respuesta.status}`;
        errores.push(`${modelo}: ${detalle}`);
        // 400 = solicitud mal formada: otro modelo no lo arreglaría. Clave inválida (401/403) tampoco.
        if ([400, 401, 403].includes(respuesta.status)) break;
        continue; // 404, 429, 500, 503 (saturado): probar el siguiente modelo
      }

      const texto = json?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
      let resultado;
      try {
        resultado = JSON.parse(texto.replace(/^```(?:json)?\s*|\s*```$/g, ''));
      } catch (e) {
        errores.push(`${modelo}: respuesta sin el formato esperado`);
        continue;
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
      return;
    } catch (error) {
      errores.push(`${modelo}: ${error.name === 'AbortError' ? 'tiempo de espera agotado' : 'sin conexión'}`);
    } finally {
      clearTimeout(temporizador);
    }
  }

  res.status(502).json({
    error: 'Gemini no está disponible en este momento (' + (errores.join(' | ') || 'sin respuesta') + '). Intente nuevamente en unos segundos.'
  });
};
