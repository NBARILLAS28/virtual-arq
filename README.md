# Virtual ARQ

Visor 3D de planos arquitectónicos: abre la casa en 3D, se camina por dentro, se
cambia la luz del día y se graba el recorrido en video (MP4 donde el navegador lo
permite, WebM en el resto). Funciona en el navegador del iPhone, sin instalar nada.

Primer caso de prueba: **Casa Pastora** (planos R1, 2 niveles, garage a +0.30 y casa a +0.90 sobre la calle).

## Qué hace hoy (v0.1)
- **Orbitar** (girar y acercar), **Recorrer** (a pie, con joystick en celular o WASD en PC), **Planta** (vista desde arriba).
- **Todo / Sin techo / Planta baja** para ver la distribución por dentro.
- **Espejo**: invierte la casa (garage a la izquierda o a la derecha).
- **Luz**: hora del día, con sol y sombras.
- **Recorrido ▶** y **Recorrido + video**: cámara automática alrededor de la casa y vista de planta sin techo.
- **● Grabar**: graba lo que se ve (orbitando o caminando) y ofrece descargar o compartir.

## Cómo se arma el modelo
1. `tools/extract_pdf.py` lee el PDF vectorial: detecta los ejes (A, B, C / 1 al 9), la escala real,
   el cuadro de niveles y los muros (rellenos negros) de cada planta. Escribe `models/<casa>.json` en metros.
2. `models/<casa>.extras.json` trae lo que el lector todavía no detecta solo: gradas, vacíos de losa,
   balcón, terraza, muebles referenciales y obra exterior. Se midió sobre los planos y es aproximado.
3. `js/builder.js` levanta muros, huecos (puertas y ventanas se deducen de los vanos entre muros),
   losas, techo, garage con rampa, gradas en U y fachada.

```bash
pip install pymupdf
python3 tools/extract_pdf.py plano.pdf --baja 1 --alta 2 --escala 75 -o models/casa.json
```

## Límites conocidos
- Puertas y ventanas salen de los vanos entre muros: no se lee su tipo ni su altura real (ventanas a 1.00 m, puertas de 2.10 m).
- Las gradas, los muebles y los detalles de fachada (arcos, pérgola, remate) están modelados a mano en `extras`.
- La orientación del sol es supuesta (la calle al sur). Hay que confirmarla en el terreno.
- El realismo es de tiempo real (materiales, luz y sombras). El fotorrealista de render va en una fase posterior.
- Cargar un PDF directo desde el navegador es la siguiente fase; hoy el modelo se genera con el script.

## Ejecutar en local
No hay compilación. Sirve la carpeta con cualquier servidor estático:

```bash
python3 -m http.server 8000
```

y abre `http://localhost:8000`.

## Publicar en Netlify
Add new site → Import from Git → `virtual-arq`. Sin comando de build; carpeta de publicación: `.` (ya está en `netlify.toml`).

## Estructura
```
index.html, css/app.css      interfaz
js/main.js                   escena, luz, modos, recorrido automático
js/builder.js                geometría de la casa
js/materials.js              materiales procedurales (sin imágenes)
js/walk.js                   caminar, colisión, joystick
js/record.js                 grabación a video
models/                      modelo leído del PDF + extras
tools/extract_pdf.py         lector de planos PDF
vendor/                      three.js r170 (MIT)
```
