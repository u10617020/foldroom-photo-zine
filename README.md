# 摺景 Foldroom

Traditional Chinese A4 photo-zine editor. Serve `dist/client` as a static directory for local editing; the published site adds a small Worker and D1 counter for anonymous usage statistics. Photos remain in browser memory and are never uploaded. Refreshing discards the editable document; a PDF is a print copy, not a saved project.

`dist/client/index.html` introduces the tool and links to `dist/client/editor.html`, where the canvas editor lives. The intro uses an actual editor screenshot in `dist/client/assets/editor-preview.webp`.

Opening the editor calls `/api/usage`. A first-party, one-year cookie prevents repeat counts in the same browser; D1 stores only an aggregate count. The homepage displays the count. This estimates browsers that opened the editor, not distinct people, and can be affected by cleared cookies or bots. The counter does not receive photos or text.

## Layout contract

297 × 210 mm, landscape, one printed side. Canvas coordinates use 3 units/mm (891 × 630). Physical sheet order is `[5,4,3,2] / [6,7,8,1]`. Top-row panels rotate 180° in reading view. Center slit spans x=74.25–222.75 mm at y=105 mm. This follows Norwich University of the Arts' [Collage Zine Worksheet](https://norwichuni.ac.uk/app/uploads/2022/03/nua_collage-zine_worksheet.pdf).

The sheet is the source of truth. Objects may cross any fold; reading preview crops the sheet before rotating each panel. Template placement rotates top-row objects into reading orientation. Free transforms remain literal to the sheet.

Text boxes start centered horizontally and vertically. Object position and size are adjusted directly on the canvas by dragging and pulling the handles; the inspector shows the resulting millimeters. A physical photo frame starts at Instax Mini size (54 × 86 mm). Place one on the selected page or one on each of the eight pages, then choose a dashed glue guide or two short diagonal cut marks at each corner. These frame marks are part of the print design even when fold/cut guides are disabled. Corner cuts must be made by hand after printing; fit and retention still require a physical trial.

Photo dragging snaps its center to sheet fold lines and page centers, and aligns its center or edges with other photos. Temporary dashed alignment lines are editor-only. Rotation uses the transformer's handle above the selected object; the numeric rotation control and photo fit selector are absent from the inspector.

## Dependencies

Vendored Konva 9.3.18 (MIT) for canvas editing and jsPDF 3.0.3 (MIT) for one-page 300 dpi raster PDF output. Chinese text supports system fonts plus bundled Noto Sans TC, Noto Serif TC, and LXGW WenKai TC, with each family's supported weights. Bundled fonts load on demand from this website; PDF export waits for them. Font licenses and sources are in `dist/client/fonts`. No third-party font requests, cloud image processing, or photo storage APIs.

## Checks

Run `node --check dist/client/app.js` and `node qa/usage.test.mjs`. Browser QA and generated diagnostic files are in ignored `qa/`. Real paper folding still requires a physical trial print.
