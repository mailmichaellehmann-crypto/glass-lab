# Design-Vorgaben für das Glass Lab

Diese Regeln gelten für jedes neue Element im Lab. Sie sind aus allen bisherigen Runden entstanden,
inklusive dessen, was nicht funktioniert hat. Ein neues Element ist fertig, wenn es jeden Punkt erfüllt.

## 1. Was ein Element ist
- **Ein echtes Bedienelement** (Schalter, Slider, Auswahl, Eingabe, Bewertung …), keine Natur-Simulation,
  keine Kunst-Szene, kein Dashboard. Es muss sofort klar sein, was man damit tut.
- **Dieselbe DNA wie der Glass Toggle**: Es soll sich anfühlen wie ein Geschwister des Toggles.
- **Intuitiv vor spektakulär.** Wenn man erst lesen muss, wie es geht, ist es falsch (daran ist Prism gescheitert).
  Die Bedienung muss sich aus der Form ergeben; Hover und Cursor zeigen, was greifbar ist.
- Es passt optisch zum Rest. Was aus der Reihe fällt, fliegt raus.

## 2. Material & Licht
- **Konsequente Draufsicht.** Alles wird von oben gesehen: Tropfen sind rund, Schatten fallen nach unten-rechts,
  Höhe zeigt sich durch weiter versetzte, weichere Schatten. Nie Seitenansicht mischen.
- **Echtes Glas** als SDF-Körper: Brechung **pro Farbkanal** (IOR ca. 1,44 / 1,50 / 1,57–1,60) für leichte
  chromatische Aberration, Fresnel, Glanzpunkt, der dem Zeiger folgt, heller Rand, Glanzstreifen nach Interaktion.
  Klar, nicht milchig (außer bewusst ganz leicht, wie beim Dial).
- **Geformte Körper wirken plastisch**: Kuppeln, Facetten (Stars), dicke Kanten. Flache Flächen wirken billig.
- **Glas über Text**: eine Platte mit flacher Oberseite und abgeschrägter Kante (`thickGlass()` bzw. `glass()` aus der Bibliothek, wie Toggle und Tabs). `thickGlass()` bricht nur die Kante, mit leichten Farbsäumen pro Kanal, und zeigt die Fläche 1:1. Nur die Kante bricht, der Text darunter bleibt scharf. Kuppeln, die Text verzerren, wirken unscharf.
- **Licht als Material**: Leuchten mit dem `emitC`-Modell (additiv im Dunkeln, Tönung im Hellen), Licht fällt in die
  Mulde und auf den Boden, sammelt sich in Glaskanten. Die Farbe trägt Bedeutung (kalt → warm, Bewertung → Hitze).
- **Mulden** (`tray`) als Untergrund, in die Seite eingelassen, mit Innenschatten.
- **Das Filament** des Toggles (umlaufender Lichtstreifen) wo es Sinn ergibt, um den Fortschritt/Wert zu zeigen.
- Gemeinsames Finish (`finish()`): Lichter laufen weiß-heiß und weich aus statt hart zu clippen, dezente Vignette,
  Lichtpool des Elements auf dem Boden, Korn. Nicht in einzelnen Elementen nachbauen.

## 3. Pixel
- Text und Werte stehen als **Pixelmatrix** (3×5-Schrift, `textCells`) **unter dem Glas** und werden durch es gebrochen.
- Pixel **morphen über Federn**, sind **scheu** (weichen dem Zeiger aus) und **ziehen nach** bei Bewegung.
- Wörter in Großbuchstaben, kurz (MEH, GOOD, WOW).
- **Pixel mit Lücke** wie eine LED-Anzeige (`size` ≈ 0,85 × Raster): das wirkt scharf. Die Engine erzwingt das jetzt selbst (die Pixelmatrix erkennt ihr Raster), setzt jedes Pixel auf ganze Gerätepixel und tastet die Pixel-Textur ohne Glättung ab. Pixel, die sich berühren, wirken weich. Unter einer flachen Glasfläche den Text 1:1 zeigen, nicht vergrößern (sonst wird neu abgetastet und unscharf).

## 4. Bewegung & Gefühl
- **Alles federt** (`Spring`): Quetschen beim Drücken, Strecken beim Ziehen, Nachwackeln beim Loslassen.
- **Kick-Licht** (`st.pulse`), **Funken** (`st.burst`), **Schockwelle** (`st.shock`) für bedeutende Momente,
  sparsam dosiert. Höhepunkte (alles erledigt, 5 Sterne) bekommen eine kleine Kettenreaktion.
- **Physik statt Animation**: Schwung, Gummiband an den Enden, Raster mit Einrasten.
- Animationen laufen im Frame-Loop, keine `setTimeout`-Ketten (Effekte mit Zeitplan über eine Event-Queue im Loop).
- `reducedMotion` respektieren (Flackern, Blitze, Wackeln reduzieren).
- **Nichts durchdringt sich**: Objekte in einer Bahn überholen einander nicht; eine Lücke schließt sich erst, wenn das Entfernte verschwunden ist; ein gezogenes Objekt wird angehoben und obenauf gezeichnet.
- **Eingabe im Element selbst** (z. B. in die leere Perle tippen), statt Dinge von einem separaten Feld herüberfliegen zu lassen.

## 5. Ton & Haptik
- Jede Interaktion hat einen leisen, passenden Ton (`ping`, `tick`, `drip`, `land`, `air`, `key`), Raster klicken.
- Vibration nur über `st.buzz()` bzw. `buzz()` aus `src/haptics.js` (Android: Vibration, iPhone: System-Tick über einen versteckten Schalter, iOS 18+; nie in Miniaturen, nie vor der ersten Berührung). Ton über `st.sfx` (in Vorschauen stumm); er wird bei der ersten abgeschlossenen Berührung freigeschaltet (iOS). Nie `navigator.vibrate` direkt aufrufen.

## 6. Hell & Dunkel
- Jedes Element sieht in **beiden Themes** richtig aus und folgt `window.glassTheme` **stufenlos**.
- Auch die Lab-Chrome (Titel, Zurück, Navigation, Hinweis, Bühnenfarbe) folgt dem Theme.
- Im Dunkeln dürfen leere Glaskörper nicht verschwinden (Rauchglas-Körper, Kantenlicht).

## 7. Vorschau im Regal (Perle)
- Zeigt das **echte Element** als **kompaktes Icon-Layout** (komplett, zentriert, keine abgeschnittenen Wörter),
  z. B. 3 statt 5 Sterne, 2 statt 4 Tabs, kurze Mulde.
- **Schwarz-weiß bis Hover**, Live-Miniatur mit **Autopilot** beim Hover, Standbild hell + dunkel aus demselben Frame.
- Nach optischen Änderungen `STILLS_VERSION` in `shelf.js` hochzählen.

## 8. Bedienung
- Maus, Touch **und Tastatur** (Pfeile, Ziffern, Enter/Space wo sinnvoll). Tastatur hat Vorrang vor Hover-Vorschau.
- Hinweiszeile (`hint`) kurz in Versalien, ausführliche Hilfe in `how`.
- Keine globalen Key-Listener in Thumb-Mode.

## 9. Qualität & Performance
- Shader-Kompilierung abwarten (`await st.ready`), nichts Halbfertiges zeigen.
- Zustand vor `glassStage`/`autosize` deklarieren (TDZ).
- Ziel: < 1 ms CPU pro Frame im Mittel, keine Janks; Pixel-Upload nur bei Änderung.
- `dispose()` räumt alles auf; nach vielen Öffnen/Schließen-Zyklen keine zusätzlichen Canvases/Kontexte.
- Im Browser prüfen: alle Interaktionen, beide Themes, Perle, `?perf`, Konsole fehlerfrei.
- Uniform-Namen dürfen nicht mit der gemeinsamen Bibliothek kollidieren (z. B. `uWave`, `uKick`, `uSweep` sind vergeben).
- Zählende Zahlen (Prozent, Zähler) wechseln **sofort** (`set(..., { instant: true })`), sonst kommen die Pixelfedern nie zur Ruhe und die Zahl verschmiert.
- Das Zeiger-Licht darf flache Kanten nicht von unten anstrahlen (harte Striche); wo der Zeiger meist unterhalb ist, nur leicht folgen lassen.
- Beim Loslassen zählt die Position der Hand, nicht die des nachziehenden Objekts.
- Nutzerdaten (Aufgaben, Eingaben) nie stillschweigend verwerfen: lieber ablehnen und das zeigen (Kopfschütteln).
- Flache oder schmale Glaskörper bekommen keinen scharfen Glanzpunkt: er schrumpft zu einem Fleck, der wie ein verirrtes Pixel wirkt. Kapseln zeigen stattdessen einen langen Glanzstreifen, eckige Zellen nur weichen Schimmer.
- Im engen Rand flacher Glaskörper bündelt die Brechung einen hellen Fleck daneben (Lichtschnur, Lichtkante) zu einem Punkt, der wie ein verirrtes Pixel wirkt: die Brechung zum äußersten Rand hin ausblenden (`thick *= smoothstep(0.0, 0.35, u)`).

## 10. Ablauf für ein neues Element
1. `src/lab/exp/<id>.js` mit `mount(root, { reducedMotion, thumb, demo })`.
2. Eintrag in `registry.js` (id, thumb, hint, name, line, how, bg, accent, load), Platzhalter in `previews.js`.
3. `STILLS_VERSION` hochzählen, README-Tabelle ergänzen.
4. Prüfen (siehe 9), dann committen und pushen.
