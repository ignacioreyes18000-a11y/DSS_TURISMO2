document.addEventListener('DOMContentLoaded', () => {
    let rutasData = [];
    const form = document.getElementById('dss-form');
    const routeSelect = document.getElementById('route-select');
    const resultsPlaceholder = document.getElementById('results-placeholder');
    const loadingSpinner = document.getElementById('loading-spinner');
    const resultsContent = document.getElementById('results-content');

    const NOMBRES_EXPERIENCIA = { '1': 'Principiante (sin experiencia previa)', '2': 'Intermedio (conocimientos básicos)', '3': 'Avanzado (dominio técnico, cursos y autonomía)' };
    const NOMBRES_ACTIVIDAD = { recreativo: 'Trekking recreativo', deportivo: 'Montañismo deportivo', cientifico: 'Educativo / científico' };
    const NOMBRES_HORARIO = { temprano: 'Temprano (mañana)', tarde: 'Tarde (mediodía/tarde)' };
    const NOMBRES_EQUIPO = {
        botiquin: 'Botiquín', linterna: 'Linterna frontal', manta: 'Manta térmica', silbato: 'Silbato de emergencia',
        gps: 'Mapas offline / GPS', capas: 'Sistema de capas (abrigo)', calzado: 'Calzado técnico',
        bastones: 'Bastones de trekking', mochila: 'Mochila adecuada', hidratacion: 'Sist. hidratación (mín. 2 L)', raciones: 'Raciones de marcha'
    };

    // Cargar Base de Datos Estática de Rutas (rutas.json)
    fetch('rutas.json')
        .then(response => response.json())
        .then(data => {
            rutasData = data.rutas;
        })
        .catch(err => {
            console.error("Error cargando rutas.json: ", err);
            // Fallback directo en caso de problemas de carga de archivo local en entornos locales de navegador
            rutasData = [
                {
                  "id": "manquehue",
                  "nombre": "Cerro Manquehue (Ruta Lo Curro - Vía Roja)",
                  "lat": -33.3461,
                  "lon": -70.5794,
                  "distancia": "5.15 km",
                  "tipo": "Ida y vuelta",
                  "desnivel_positivo": 571,
                  "desnivel_negativo": 571,
                  "altitud_maxima": 1646,
                  "altitud_minima": 1058,
                  "puntos_agua": "No existen fuentes de agua en la ruta; debes llevar mínimo 2 litros por persona.",
                  "refugios": "No hay refugios habilitados en la ruta.",
                  "cierres": "Senderos administrados que exigen registro. El acceso principal (Vía Roja) suele presentar cierres parciales intermitentes por fallos judiciales y protección ambiental, por lo que debes verificar el estado del sendero.",
                  "dificultad_base_score": 2
                },
                {
                  "id": "provincia",
                  "nombre": "Cerro Provincia (Ruta Normal por Puente Ñilhue)",
                  "lat": -33.4358,
                  "lon": -70.4353,
                  "distancia": "9.75 km",
                  "tipo": "Solo ida",
                  "desnivel_positivo": 1662,
                  "desnivel_negativo": 21,
                  "altitud_maxima": 2703,
                  "altitud_minima": 1037,
                  "puntos_agua": "No hay fuentes de agua naturales en todo el trayecto.",
                  "refugios": "Cuenta con un domo de emergencia en la zona de cumbre (Proyecto Protege).",
                  "cierres": "Es una ruta concesionada por la Asociación Parque Cordillera. En horario de invierno, la hora límite de ingreso es a las 13:00 hrs y el cierre de portones es a las 19:00 hrs. Para tarifas, permisos e información actualizada, revisa el Portal de Parques Cordillera.",
                  "dificultad_base_score": 1
                },
                {
                  "id": "plata",
                  "nombre": "Quebrada de la Plata",
                  "lat": -33.4981,
                  "lon": -70.8994,
                  "distancia": "7.84 km",
                  "tipo": "Ida y vuelta",
                  "desnivel_positivo": 279,
                  "desnivel_negativo": 279,
                  "altitud_maxima": 767,
                  "altitud_minima": 521,
                  "puntos_agua": "No hay agua potable en el sendero.",
                  "refugios": "No existen refugios de montaña.",
                  "cierres": "El área es administrada por la Facultad de Ciencias Agronómicas de la Universidad de Chile. El acceso suele requerir coordinación o inscripción previa, dependiendo de la época del año o si vas a un evento específico.",
                  "dificultad_base_score": 3
                }
            ];
        });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const routeId = routeSelect.value;
        if (!routeId) return;

        // Ocultar resultados previos y mostrar cargador
        resultsPlaceholder.classList.add('hidden');
        resultsContent.classList.add('hidden');
        loadingSpinner.classList.remove('hidden');

        const ruta = rutasData.find(r => r.id === routeId);

        // 1. Consultar API Abierta de Open-Meteo en Tiempo Real
        let currentEnv;
        try {
            const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${ruta.lat}&longitude=${ruta.lon}&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,cloud_cover,shortwave_radiation&timezone=America/Santiago`;
            const weatherResponse = await fetch(weatherUrl);
            const weatherData = await weatherResponse.json();
            currentEnv = weatherData.current;
            if (!currentEnv) throw new Error('Respuesta de Open-Meteo sin datos actuales');
        } catch (error) {
            console.error("Error consultando Open-Meteo:", error);
            alert("No fue posible obtener datos meteorológicos de Open-Meteo. Revise la conexión a internet e intente nuevamente. No se generará una recomendación sin datos ambientales reales.");
            loadingSpinner.classList.add('hidden');
            resultsPlaceholder.classList.remove('hidden');
            return;
        }

        // 2. Consultar API Abierta de GBIF en Tiempo Real (cuadrante en torno a la ruta, solo registros en Chile)
        // Si GBIF falla, se continúa y se informa explícitamente que no hay datos (nunca se muestran especies de ejemplo).
        let bioResults = null;
        let gbifError = false;
        try {
            const offset = 0.05;
            const bioUrl = `https://api.gbif.org/v1/occurrence/search?decimalLatitude=${ruta.lat - offset},${ruta.lat + offset}&decimalLongitude=${ruta.lon - offset},${ruta.lon + offset}&country=CL&hasCoordinate=true&hasGeospatialIssue=false&limit=150`;
            const bioResponse = await fetch(bioUrl);
            const bioData = await bioResponse.json();
            bioResults = bioData.results || [];
        } catch (error) {
            console.error("Error consultando GBIF:", error);
            gbifError = true;
        }

        // Procesar y renderizar datos (motor de reglas)
        const modelResult = processDSSData(ruta, currentEnv, bioResults, gbifError);
        renderResults(modelResult);

        // 3. Capa de modelo de lenguaje (Gemini), vía la función /api/recomendacion
        solicitarRecomendacionIA(modelResult);
    });

    // SISTEMA DE RAZONAMIENTO Y PONDERACIONES DETERMINÍSTICAS (Puntajes)
    function processDSSData(ruta, weather, rawEspecies, gbifError) {
        let scores = { ambiente: 3, territorio: 3, patrimonio: 3, humano: 3 };

        // === A. AMBIENTE (Max: 3 pts) ===
        // Algoritmo: Penalizaciones por viento fuerte, lluvia o frío crítico
        if (weather.precipitation > 2.0) {
            scores.ambiente -= 1.5; // Lluvia moderada/fuerte
        } else if (weather.precipitation > 0.1) {
            scores.ambiente -= 0.5; // Llovizna leve
        }
        if (weather.wind_speed_10m > 30) {
            scores.ambiente -= 1.0; // Viento fuerte precordillerano
        } else if (weather.wind_speed_10m > 15) {
            scores.ambiente -= 0.5;
        }
        if (weather.temperature_2m < 5.0 || weather.temperature_2m > 30.0) {
            scores.ambiente -= 0.5; // Temperaturas extremas
        }
        scores.ambiente = Math.max(0, scores.ambiente);

        // === B. TERRITORIO (Max: 3 pts) ===
        // El puntaje base depende de la dificultad intrínseca de la ruta.
        scores.territorio = ruta.dificultad_base_score;
        // Penalización adicional si no hay agua
        if (ruta.puntos_agua.toLowerCase().includes("no hay") || ruta.puntos_agua.toLowerCase().includes("no existen")) {
            scores.territorio -= 1.0;
        }
        scores.territorio = Math.max(0, scores.territorio);

        // === C. PATRIMONIO NATURAL (Max: 3 pts) ===
        // Especies registradas en GBIF con su categoría UICN real (cuando GBIF la informa)
        const especiesCuradas = gbifError ? [] : filterGBIFSpecies(rawEspecies);
        const sinDatosPatrimonio = especiesCuradas.length === 0;

        let vulnerableCount = especiesCuradas.filter(e => e.vulnerable).length;
        if (vulnerableCount >= 2) {
            scores.patrimonio = 1.0; // Alta vulnerabilidad (mientras más amenazado, menor puntaje general)
        } else if (vulnerableCount === 1) {
            scores.patrimonio = 2.0; // Vulnerabilidad moderada
        } else {
            scores.patrimonio = 3.0; // Sin especies amenazadas registradas (o sin datos: se informa aparte)
        }

        // === D. FACTOR HUMANO (Max: 3 pts) ===
        const experienceInput = parseFloat(document.getElementById('human-experience').value); // 1, 2, 3
        const startTime = document.getElementById('start-time').value; // 'temprano', 'tarde'
        const groupSize = parseInt(document.getElementById('group-size').value, 10);
        const avgAge = parseInt(document.getElementById('avg-age').value, 10);
        const activity = document.getElementById('activity-type').value;

        // Obtener elementos marcados del equipamiento
        const allChecks = Array.from(document.querySelectorAll('.equip-check'));
        const checkedValues = allChecks.filter(c => c.checked).map(c => c.value);
        const missingValues = allChecks.filter(c => !c.checked).map(c => c.value);

        // Cálculo del score del factor humano
        let humanScore = experienceInput; // Iniciamos con el valor base de experiencia (1 a 3)

        // Penalización por inicio tardío si no se es experto
        if (startTime === 'tarde' && experienceInput < 3) {
            humanScore -= 0.5;
        }

        // Penalización severa por falta de elementos críticos de seguridad (Manta, linterna, botiquín)
        if (!checkedValues.includes('linterna') || !checkedValues.includes('manta') || !checkedValues.includes('botiquin')) {
            humanScore -= 1.0;
        }
        scores.humano = Math.max(0, humanScore);

        const humano = {
            experiencia: NOMBRES_EXPERIENCIA[String(experienceInput)] || String(experienceInput),
            tamano_grupo: groupSize,
            edad_promedio: avgAge,
            actividad: NOMBRES_ACTIVIDAD[activity] || activity,
            horario_salida: NOMBRES_HORARIO[startTime] || startTime,
            equipo_disponible: checkedValues.map(v => NOMBRES_EQUIPO[v] || v),
            equipo_faltante: missingValues.map(v => NOMBRES_EQUIPO[v] || v)
        };

        // === CÁLCULO FINAL ===
        const totalScore = scores.ambiente + scores.territorio + scores.patrimonio + scores.humano;
        let riskLevel = "BAJO";
        let cssClass = "low";

        if (totalScore <= 3.0) {
            riskLevel = "CRÍTICO";
            cssClass = "critical";
        } else if (totalScore <= 6.0) {
            riskLevel = "ALTO";
            cssClass = "high";
        } else if (totalScore <= 9.0) {
            riskLevel = "MODERADO";
            cssClass = "moderate";
        }

        // === IDENTIFICAR DIMENSIONES DÉBILES ===
        let debilidades = [];
        if (scores.ambiente <= 1.5) debilidades.push("Ambiente (Condiciones climáticas desfavorables)");
        if (scores.territorio <= 1.5) debilidades.push("Territorio (Ausencia de agua, alto desnivel o restricciones técnicas)");
        if (scores.patrimonio <= 1.5) debilidades.push("Patrimonio (Presencia de especies en categorías de amenaza UICN que aumentan la fragilidad ecológica)");
        if (scores.humano <= 1.5) debilidades.push("Factor Humano (Nivel técnico insuficiente, salida tardía o falta de equipo crítico)");

        if (debilidades.length === 0) {
            // Si todo está bien, marcar la menor puntuación relativa
            const minScoreVal = Math.min(scores.ambiente, scores.territorio, scores.patrimonio, scores.humano);
            if (minScoreVal === scores.ambiente) debilidades.push("Ambiente (por menor puntaje relativo)");
            else if (minScoreVal === scores.territorio) debilidades.push("Territorio (por menor puntaje relativo)");
            else if (minScoreVal === scores.patrimonio) debilidades.push("Patrimonio (por menor puntaje relativo)");
            else debilidades.push("Factor Humano (por menor puntaje relativo)");
        }

        // Generar Recomendaciones de Mitigación
        let mitigaciones = [];
        if (startTime === 'tarde') {
            mitigaciones.push("Establecer de forma obligatoria un tiempo límite de retorno (turn-back time) preventivo y portar linternas frontales operativas.");
        }
        if (ruta.puntos_agua.toLowerCase().includes("no hay") || ruta.puntos_agua.toLowerCase().includes("no existen")) {
            mitigaciones.push("Incrementar el volumen de hidratación individual a un mínimo de 2.5 o 3 litros antes de iniciar el ascenso.");
        }
        if (scores.humano < 2) {
            mitigaciones.push("Recomendar que el grupo vaya acompañado por un guía certificado o realizar un tramo menor delimitando la altitud máxima.");
        }
        if (vulnerableCount > 0) {
            mitigaciones.push("Restringir estrictamente el paso a senderos delimitados para no degradar el hábitat de especies en categoría de amenaza.");
        }
        if (weather.precipitation > 0.1 || weather.wind_speed_10m > 20) {
            mitigaciones.push("Asegurar el porte de ropa técnica impermeable (tercera capa) y evitar las zonas con riesgo de desprendimiento de rocas expuestas.");
        }

        // Fallback genérico si no hay mitigaciones
        if (mitigaciones.length === 0) {
            mitigaciones.push("Realizar un chequeo de equipo general estándar y registrarse con las autoridades administrativas correspondientes de la ruta.");
        }

        const recomendacionTexto = generarTextoReglas(ruta, weather, especiesCuradas, sinDatosPatrimonio, gbifError, humano, totalScore, riskLevel, debilidades, mitigaciones);

        return {
            ruta,
            weather,
            especies: especiesCuradas,
            sinDatosPatrimonio,
            gbifError,
            humano,
            scores,
            totalScore,
            riskLevel,
            cssClass,
            debilidades,
            mitigaciones,
            recomendacionTexto
        };
    }

    // Seleccionar especies registradas en GBIF usando solo la información que GBIF entrega.
    // No se asume origen nativo: GBIF no lo informa de forma confiable en estos registros.
    // La categoría de conservación es la UICN global que GBIF adjunta al registro, si existe.
    function filterGBIFSpecies(results) {
        if (!results || results.length === 0) return [];

        const GRUPOS = {
            Aves: 'Aves', Reptilia: 'Reptiles', Amphibia: 'Anfibios', Mammalia: 'Mamíferos', Insecta: 'Insectos',
            Magnoliopsida: 'Plantas', Liliopsida: 'Plantas', Pinopsida: 'Plantas', Polypodiopsida: 'Plantas'
        };
        const CATEGORIAS_UICN = {
            CR: 'En peligro crítico (UICN)', EN: 'En peligro (UICN)', VU: 'Vulnerable (UICN)',
            NT: 'Casi amenazada (UICN)', LC: 'Preocupación menor (UICN)', DD: 'Datos insuficientes (UICN)',
            NE: 'No evaluada (UICN)'
        };
        const PRIORIDAD = { CR: 0, EN: 1, VU: 2, NT: 3 };

        const porEspecie = new Map();
        for (let item of results) {
            const nombre = item.species; // nombre a nivel de especie normalizado por GBIF
            if (!nombre || porEspecie.has(nombre)) continue;
            if (item.kingdom !== 'Plantae' && item.kingdom !== 'Animalia') continue;

            const codigo = item.iucnRedListCategory || null;
            porEspecie.set(nombre, {
                nombre,
                tipo: GRUPOS[item.class] || (item.kingdom === 'Plantae' ? 'Plantas' : 'Fauna (otros grupos)'),
                estado: codigo ? (CATEGORIAS_UICN[codigo] || `Categoría UICN: ${codigo}`) : 'Sin categoría UICN informada en GBIF',
                codigoUICN: codigo,
                vulnerable: ['CR', 'EN', 'VU'].includes(codigo)
            });
        }

        // Priorizar especies con categoría de amenaza; luego el resto en el orden de GBIF
        return Array.from(porEspecie.values())
            .sort((a, b) => (PRIORIDAD[a.codigoUICN] ?? 9) - (PRIORIDAD[b.codigoUICN] ?? 9))
            .slice(0, 6);
    }

    // Texto del motor de reglas (determinístico y trazable: cada línea muestra el dato que la origina)
    function generarTextoReglas(ruta, weather, especies, sinDatosPatrimonio, gbifError, humano, score, risk, debilidades, mitigaciones) {
        const listaDebiles = debilidades.join(", ");
        let textoPatrimonio;
        if (gbifError) {
            textoPatrimonio = 'No fue posible consultar GBIF en este momento; la dimensión patrimonial queda <strong>sin datos</strong> en este análisis.';
        } else if (sinDatosPatrimonio) {
            textoPatrimonio = 'GBIF no informa registros de flora o fauna a nivel de especie en esta cuadrícula; la dimensión patrimonial queda <strong>sin datos</strong>.';
        } else {
            textoPatrimonio = 'GBIF registra en esta cuadrícula especies como: <em>' + especies.map(e => `${e.nombre} (${e.tipo}; ${e.estado})`).join(', ') + '</em>.';
        }
        const faltante = humano.equipo_faltante.length ? humano.equipo_faltante.join(', ') : 'ninguno';

        let texto = `<p>Ruta: <strong>${ruta.nombre}</strong>. Puntaje acumulado de las reglas: <strong>${score.toFixed(1)} / 12</strong>, nivel de riesgo <strong>${risk}</strong>.</p>`;

        texto += `<p><strong>Datos integrados por dimensión:</strong></p><ul>`;
        texto += `<li><strong>Ambiente</strong> (Open-Meteo, tiempo real): ${weather.temperature_2m} °C, viento ${weather.wind_speed_10m} km/h, precipitación ${weather.precipitation} mm.</li>`;
        texto += `<li><strong>Territorio</strong> (ficha de ruta): ${ruta.distancia}, desnivel positivo ${ruta.desnivel_positivo} m, altitud máxima ${ruta.altitud_maxima} msnm. Agua: <em>"${ruta.puntos_agua}"</em> Refugios: <em>"${ruta.refugios}"</em></li>`;
        texto += `<li><strong>Patrimonio natural</strong> (GBIF): ${textoPatrimonio}</li>`;
        texto += `<li><strong>Factor humano</strong> (declarado): ${humano.experiencia}; grupo de ${humano.tamano_grupo} persona(s), edad promedio ${humano.edad_promedio} años; ${humano.actividad}; salida ${humano.horario_salida.toLowerCase()}. Equipo faltante: ${faltante}.</li>`;
        texto += `</ul>`;

        texto += `<p class="alert-debilidad">⚠️ <strong>Dimensión más débil según las reglas:</strong> ${listaDebiles}.</p>`;

        texto += `<p><strong>Medidas de mitigación activadas por las reglas:</strong></p><ol>`;
        mitigaciones.forEach(m => {
            texto += `<li>${m}</li>`;
        });
        texto += `</ol>`;

        return texto;
    }

    // Capa de modelo de lenguaje: envía los datos integrados + resultado de reglas a /api/recomendacion
    async function solicitarRecomendacionIA(res) {
        const iaStatus = document.getElementById('ia-status');
        const iaText = document.getElementById('ia-text');
        iaText.innerHTML = '';
        iaStatus.className = 'ia-status';
        iaStatus.textContent = 'Gemini está redactando la recomendación a partir de los datos integrados…';

        const payload = {
            ruta: {
                nombre: res.ruta.nombre,
                distancia: res.ruta.distancia,
                tipo: res.ruta.tipo,
                desnivel_positivo_m: res.ruta.desnivel_positivo,
                altitud_maxima_msnm: res.ruta.altitud_maxima,
                altitud_minima_msnm: res.ruta.altitud_minima,
                puntos_agua: res.ruta.puntos_agua,
                refugios: res.ruta.refugios,
                cierres: res.ruta.cierres
            },
            ambiente: {
                fuente: 'Open-Meteo (tiempo real)',
                temperatura_c: res.weather.temperature_2m,
                viento_kmh: res.weather.wind_speed_10m,
                precipitacion_mm: res.weather.precipitation,
                humedad_pct: res.weather.relative_humidity_2m,
                nubosidad_pct: res.weather.cloud_cover,
                radiacion_wm2: res.weather.shortwave_radiation
            },
            patrimonio: {
                fuente: 'GBIF',
                sin_datos: res.sinDatosPatrimonio,
                especies: res.especies.map(e => ({ nombre: e.nombre, grupo: e.tipo, categoria_conservacion: e.estado }))
            },
            humano: res.humano,
            reglas: {
                puntajes_sobre_3: res.scores,
                puntaje_total_sobre_12: res.totalScore,
                nivel_riesgo: res.riskLevel,
                dimensiones_debiles: res.debilidades,
                mitigaciones: res.mitigaciones
            }
        };

        try {
            const respuesta = await fetch('api/recomendacion', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            let datos = null;
            try { datos = await respuesta.json(); } catch (e) { datos = null; }

            if (!respuesta.ok || !datos || !Array.isArray(datos.afirmaciones)) {
                const motivo = (datos && datos.error) ? datos.error : 'La capa de IA no está disponible en esta versión de la página.';
                mostrarIANoDisponible(motivo);
                return;
            }
            renderIA(datos);
        } catch (error) {
            console.error('Error en la capa de IA:', error);
            mostrarIANoDisponible('No fue posible conectar con la capa de IA.');
        }
    }

    function mostrarIANoDisponible(motivo) {
        const iaStatus = document.getElementById('ia-status');
        iaStatus.className = 'ia-status ia-status-off';
        iaStatus.textContent = `${motivo} Se muestra solo el análisis por reglas.`;
    }

    function escaparHTML(s) {
        return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    function renderIA(datos) {
        const ETIQUETAS = { ambiental: 'Ambiental', territorial: 'Territorial', patrimonial: 'Patrimonial', humana: 'Humana', reglas: 'Reglas del DSS' };
        const iaStatus = document.getElementById('ia-status');
        const iaText = document.getElementById('ia-text');

        let html = `<p class="ia-sintesis">${escaparHTML(datos.sintesis)}</p><ul class="ia-afirmaciones">`;
        datos.afirmaciones.forEach(a => {
            const dim = ETIQUETAS[a.dimension] ? a.dimension : 'reglas';
            html += `<li class="ia-item dim-${dim}">
                <span class="dim-chip dim-${dim}">${ETIQUETAS[dim]}</span>
                <span class="ia-texto">${escaparHTML(a.texto)}</span>
                <span class="ia-fuente">Dato de origen: ${escaparHTML(a.dato_fuente)}</span>
            </li>`;
        });
        html += `</ul>`;
        if (datos.nota_para_el_guia) {
            html += `<p class="ia-nota">${escaparHTML(datos.nota_para_el_guia)}</p>`;
        }
        iaText.innerHTML = html;
        iaStatus.className = 'ia-status ia-status-ok';
        iaStatus.textContent = `Redactado por el modelo de lenguaje ${datos.modelo} a partir de los datos y reglas anteriores. Verifique cada afirmación con su dato de origen.`;
    }

    // Función de Renderizado de la Interfaz del Usuario
    function renderResults(res) {
        // Detener animación de carga
        loadingSpinner.classList.add('hidden');
        resultsContent.classList.remove('hidden');

        // Modificar tarjeta de riesgo
        const riskCard = document.getElementById('risk-card');
        riskCard.className = `risk-card ${res.cssClass}`;
        document.getElementById('risk-level-title').innerText = res.riskLevel;
        document.getElementById('total-score').innerText = res.totalScore.toFixed(1);

        // Actualizar barras de progreso y texto de scores parciales
        updateProgressBar('bar-ambiente', 'score-ambiente', res.scores.ambiente);
        updateProgressBar('bar-territorio', 'score-territorio', res.scores.territorio);
        updateProgressBar('bar-patrimonio', 'score-patrimonio', res.scores.patrimonio);
        updateProgressBar('bar-humano', 'score-humano', res.scores.humano);

        // Actualizar datos del clima en la tarjeta lateral
        document.getElementById('weather-details').innerHTML = `
            🌡️ <strong>Temp:</strong> ${res.weather.temperature_2m}°C <br>
            💨 <strong>Viento:</strong> ${res.weather.wind_speed_10m} km/h <br>
            🌧️ <strong>Precipitación:</strong> ${res.weather.precipitation} mm <br>
            ☁️ <strong>Humedad:</strong> ${res.weather.relative_humidity_2m}% <br>
            ☀️ <strong>Radiación:</strong> ${res.weather.shortwave_radiation || 0} W/m²
        `;

        // Actualizar lista de especies GBIF
        const bioList = document.getElementById('biodiversity-list');
        const bioNote = document.getElementById('bio-note');
        bioList.innerHTML = '';
        if (res.especies.length === 0) {
            const li = document.createElement('li');
            li.textContent = res.gbifError
                ? 'No fue posible consultar GBIF. Sin datos patrimoniales en este análisis.'
                : 'GBIF no informa registros a nivel de especie en esta cuadrícula.';
            bioList.appendChild(li);
        } else {
            res.especies.forEach(esp => {
                const li = document.createElement('li');
                li.innerHTML = `<strong><em>${escaparHTML(esp.nombre)}</em></strong><br><span>${escaparHTML(esp.tipo)} | ${escaparHTML(esp.estado)}</span>`;
                if (esp.vulnerable) li.classList.add('vulnerable-item');
                bioList.appendChild(li);
            });
        }
        bioNote.textContent = 'Registros de ocurrencia de GBIF en un radio aproximado de 5 km. La categoría corresponde a la Lista Roja UICN global informada por GBIF; el origen (nativo o introducido) no se infiere automáticamente.';

        // Insertar análisis por reglas
        document.getElementById('recommendation-text').innerHTML = res.recomendacionTexto;
    }

    function updateProgressBar(barId, textId, score) {
        const bar = document.getElementById(barId);
        const txt = document.getElementById(textId);
        const percentage = (score / 3) * 100;

        bar.style.width = `${percentage}%`;
        txt.innerText = `${score.toFixed(1)} / 3 pts`;

        // Clasificación de color interna por barra
        if (score <= 1.0) bar.style.backgroundColor = 'var(--red-color)';
        else if (score <= 2.0) bar.style.backgroundColor = 'var(--yellow-color)';
        else bar.style.backgroundColor = 'var(--green-color)';
    }
});
