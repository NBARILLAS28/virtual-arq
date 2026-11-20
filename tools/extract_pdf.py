#!/usr/bin/env python3
"""
Virtual ARQ - lector de planos PDF vectoriales.

Lee las plantas de un PDF (muros = rellenos negros) y escribe un model.json en
metros. Los ejes (A,B,C / 1..9) se detectan por el texto del plano y fijan el
origen y la escala real. Los niveles salen del "cuadro de niveles" si existe.

Uso:
  python3 tools/extract_pdf.py plano.pdf --baja 1 --alta 2 --escala 75 -o models/casa.json

Este lector es la primera fase: detecta muros y huecos. Puertas, ventanas, gradas
y muebles se completan con las cotas del plano (ver README).
"""
import argparse, json, re, sys
import pymupdf

PT_MM = 25.4 / 72.0


def axis_positions(page):
    """Devuelve (xs, ys): posicion en puntos PDF de los ejes de letras y de numeros."""
    xs, ys = {}, {}
    for x0, y0, x1, y1, t, *_ in page.get_text("words"):
        t = t.strip()
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        # circulos de ejes: letras arriba, numeros a los lados del dibujo
        if t in ("A", "B", "C", "D", "E", "F") and cy < 400 and 450 < cx < 1100:
            xs.setdefault(t, cx)
        if t.isdigit() and len(t) == 1 and 450 < cx < 560 and 150 < cy < 950:
            ys.setdefault(int(t), cy)
    return xs, ys


def levels_from_text(page):
    txt = page.get_text()
    def grab(pat, default):
        m = re.search(pat + r"[ .…]*([+-]?\d+\.\d+)", txt)
        return float(m.group(1)) if m else default
    return {
        "calle": 0.0,
        "pb": grab(r"N\.P\.T\. planta baja \(casa\)", 0.90),
        "garaje": grab(r"N\.P\.T\. garaje", 0.30),
        "pa": grab(r"N\.P\.T\. planta alta", 3.62),
        "techo": grab(r"Losa de techo \(cara superior\)", 6.34),
        "cimientos": grab(r"Nivel de desplante \(cimientos\)", -0.60),
        "pisoAPiso": grab(r"Piso a piso", 2.72),
        "alturaLibre": grab(r"Altura libre PB / PA", 2.60),
    }


def wall_rects(page, S, ox, oy):
    out = []
    for d in page.get_drawings():
        f = d.get("fill")
        if f and tuple(f) == (0, 0, 0):
            r = d["rect"]
            w, h = r.width * S, r.height * S
            if max(w, h) > 0.2 and 0.08 < min(w, h) < 0.5:
                out.append({
                    "x0": round((r.x0 - ox) * S, 3), "x1": round((r.x1 - ox) * S, 3),
                    "z0": round((r.y0 - oy) * S, 3), "z1": round((r.y1 - oy) * S, 3),
                })
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf")
    ap.add_argument("--baja", type=int, default=1)
    ap.add_argument("--alta", type=int, default=2)
    ap.add_argument("--escala", type=float, default=75)
    ap.add_argument("-o", "--out", default="model.json")
    a = ap.parse_args()

    doc = pymupdf.open(a.pdf)
    S = a.escala * PT_MM / 1000.0  # metros por punto PDF
    pb, pa = doc[a.baja - 1], doc[a.alta - 1]
    xs, ys = axis_positions(pb)
    if "A" not in xs or 1 not in ys:
        sys.exit("No encontre los ejes A y 1 en la planta baja.")
    ox, oy = xs["A"], ys[1]   # origen: eje A, eje 1 (frente). z crece hacia la calle.
    model = {
        "meta": {"fuente": a.pdf.split("/")[-1], "escala": a.escala, "unidad": "m",
                 "nota": "x a la derecha, z hacia la calle; origen en ejes A y 1"},
        "levels": levels_from_text(pb),
        "axes": {
            "x": {k: round((v - ox) * S, 3) for k, v in xs.items()},
            "z": {str(k): round((v - oy) * S, 3) for k, v in ys.items()},
        },
        "walls": {
            "pb": wall_rects(pb, S, ox, oy),
            "pa": wall_rects(pa, S, ox, oy),
        },
    }
    json.dump(model, open(a.out, "w"), indent=1, ensure_ascii=False)
    print("OK", a.out, {k: len(v) for k, v in model["walls"].items()}, "ejes", model["axes"]["x"])


if __name__ == "__main__":
    main()
