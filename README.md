# Glass Toggle — Remix

Eine eigenständige Neuumsetzung des Experiments
[„Glass Light Toggle“ von Zsolt Kacso / thisiswhitespace](https://experiments.thisiswhitespace.com/glass-light-toggle),
erweitert um neue Features. Reines Vanilla-JS + WebGL2, keine Dependencies, kein Build-Schritt.

```bash
cd "glass-toggle" && python3 serve.py
```
→ http://localhost:5178 (ES-Module brauchen einen HTTP-Server, `file://` geht nicht. `serve.py` ist ein `http.server` mit `Cache-Control: no-store`, damit geänderte Module beim Neuladen nie veraltet aus dem Cache kommen).

URL-Parameter: `?set=power|sound|heart|celestial`, `?zoom=1.6`, `?embed=1` (nur der Schalter).

---

## Reverse Engineering: wie das Original funktioniert

### Hülle
Die Seite ist eine Next.js-App (Turbopack-Chunks). Die eigentliche Experiment-Seite rendert nur ein
`<iframe src="/standalone/glass-light-toggle/index.html">`. Darin steckt **eine einzige
`main.js` (~630 Zeilen), Vanilla, ohne Libraries**.

### Der Kern in drei Schichten

1. **Ein Fullscreen-Fragment-Shader zeichnet alles.** Ein einziges Dreieck deckt den Viewport ab.
   Seite, Track, Glas-Knopf und Lichtleiste sind **Signed Distance Fields** (`sdRoundBox`), es gibt
   keine Geometrie. Das Layout entsteht in „Design-Pixeln“ und wird um die Mitte skaliert.

2. **Das Glas** ist ein abgerundetes Quadrat-SDF:
   - Die **Normale** kommt aus dem Gradienten des SDF (zentrale Differenzen).
   - Die **Fase** (`bevel = (1 - depth/26)^2.6`) steuert alles: Die Refraktion verschiebt den Sample-Punkt
     entlang `-normal * bevel * strength`, dazu leichte Vergrößerung in der Mitte.
   - **Chromatische Aberration:** R, G und B samplen die Icon-Textur mit unterschiedlichem Offset.
   - **Frost:** Am Rand wird zwischen scharfer und weichgezeichneter Icon-Textur überblendet.
   - **Spekular-Licht, Rand-Lichtsaum und Schatten** kommen aus `dot(normal, lightDir)`.

3. **Die Lichtleiste** ist eine gebogene Kapsel: Die *radiale* Distanz ist das Knopf-SDF minus 6,5 px.
   Die *tangentiale* Distanz ist der Winkel jenseits der halben Leistenlänge. `length(vec2(rad, tang))`
   ergibt eine Leiste, die sich um das Glas legt. Ihr Winkel **umkreist** den Knopf: Bei Nacht sitzt sie
   unten, bei Tag oben. Die Richtung wird nur im Ruhezustand festgelegt, damit ein Umkehren mitten im
   Ziehen denselben Bogen zurückläuft. Für die Phase gibt es eine eigene, kritisch gedämpfte Feder,
   deshalb gleitet die Leiste hinter dem Knopf her.

**Glow-Modell (der eigentliche Trick):** Auf Dunkel wird Licht *addiert*. Auf Hell würde Addieren
nichts bewirken, deshalb wird dort zu einer gesättigten Tönung *gemischt*
(`mix(col, light, 1-exp(-a*1.3))`). Eine Funktion, gleich starke Wirkung in beiden Themes.

### Die Pixel-Icons (CPU)
- Mond und Sonne sind prozedural erzeugte Zellen auf einem 17×17-Raster.
- **Pairing:** Beide Icons werden nach dem Winkel um die Mitte sortiert und proportional gepaart.
  Überschüssige Pixel bekommen einen Partner mit Helligkeit 0 und blenden aus. Nachbarn im Winkel
  fliegen zusammen, deshalb liest sich die Verwandlung als ein Wirbel.
- Jedes Pixel hat Verzögerung, Drehung, Ausdehnung und Federhärte. Sein Ziel ergibt sich aus der
  **Knopfposition**, nicht aus der Zeit. Wer auf halbem Weg loslässt, hält den Schwarm also mitten im Flug fest.
- Die Pixel werden in jedem Frame in ein 2D-Canvas gezeichnet, dazu eine halb aufgelöste, weichgezeichnete
  Kopie. Beide gehen als Texturen an den Shader, der sie *durch* das Glas hindurch abtastet.

### Physik
Knopf-Feder mit Sub-Steps. Beim Ziehen über die Enden hinaus gibt es einen Gummiband-Effekt (×0,22).
Squash & Stretch hängen von der Geschwindigkeit und vom Überschwingen ab. Ein Flick wird über die
Wurfgeschwindigkeit entschieden (`p + v*0.15 > 0.5`).

---

## Was neu ist

| Feature | Umsetzung |
|---|---|
| **4 Icon-Sets** (Mond→Sonne, Power→Blitz, Stumm→Ton, gebrochenes→volles Herz) | generische Raster-Helfer (Kreis, Polygon, Linie, implizites Herz), `1`–`4`. Ein neues Set setzt sich aus einer Pixelwolke zusammen |
| **Schockwelle** | refraktiver Ring, der beim Landen über Seite und Glas rollt |
| **Funken** | bis zu 32 Partikel mit Schwerkraft, als Uniform-Array im Shader gerendert, mit demselben Glow-Modell |
| **Pointer als Lichtquelle** | Das Spekularlicht dreht sich zur Maus, dazu eine weiche Kaustik unter dem Cursor |
| **Scheue Pixel** | Pixel weichen dem Cursor auf dem Glas federnd aus |
| **Glanzstreifen** | ein diagonaler Glint, der nach jedem Umschalten über das Glas wischt |
| **Sternenhimmel mit Parallaxe** | zwei prozedurale Ebenen, die funkeln und der Maus folgen (nur im Dark-Mode) |
| **Verjüngte Lichtleiste** | dick in der Mitte, dünn an den Spitzen, wirkt wie ein Filament |
| **Prozeduraler Sound** | Glas-„Ping“ (unharmonische Teiltöne), Aufprall-Thud und ein Rauschen, das der Geschwindigkeit folgt. Reines WebAudio. `M` schaltet stumm |
| **Haptik** | `navigator.vibrate` auf Mobilgeräten |
| **Live-Panel** | alle Parameter live, Shuffle (`R`), Reset, Settings als JSON kopieren. `H` blendet es aus |
| **Persistenz & System-Theme** | Zustand und Einstellungen in `localStorage`. Der Startzustand folgt `prefers-color-scheme` |
| **A11y** | versteckter `role="switch"` mit `aria-checked`, Pfeiltasten setzen gezielt, `prefers-reduced-motion` dämpft Effekte |

---

## World-Edition: 3 neue Ideen, abgeleitet aus Kacsos Werk

Ich habe seinen Katalog mit 39 Arbeiten analysiert. Die wiederkehrenden Muster:
- **UI wird zu Material:** Glas (Glass Hero, Liquid Glass Recorder), Ton (Clay Toggle), Feuer (One-Time Code)
- **Der Cursor ist ein physischer Akteur:** Er biegt, pustet oder wirft Licht (Lathe, Jungle Canopy, Pendant Lamp)
- **Licht macht Inhalte sichtbar:** Die Seite ist nur dort lesbar, wo der Strahl hinfällt (Pendant Lamp)
- **Punkt- und Pixelmatrizen setzen sich zu Bildern zusammen** (Dot Hover Cards, Particle Phones, Dot Form)
- **Echte Physik und echte Sensoren:** Pendel, Federn, Mikrofon-Bänder

Daraus folgen drei Ideen, die es dort so nicht gibt. Die Grundfrage dahinter: *Was wäre, wenn der Schalter
ein echtes Objekt in einer echten Welt wäre?*

| # | Feature | Idee | Bedienung |
|---|---|---|---|
| 1 | **Herausreißbarer Knopf** | Zieh den Knopf senkrecht aus der Schiene, dann ist er ein freier Glaskörper mit Schwerkraft, Abprall, Squash & Stretch, Funken und Schockwelle beim Aufprall. Er bricht die Seite (Sterne) unter sich, und der leere Slot pulsiert. Wirf ihn zurück in die Schiene: Die Seite, auf der er landet, entscheidet über den Zustand. | senkrecht ziehen. Doppelklick, `Space` oder Ruhe holen ihn heim |
| 2 | **Schwapp-Physik** | Die Icon-Pixel sind Teilchen *im* Glas. Sie spüren die umgekehrte Beschleunigung des Knopfs, die Schwerkraft und die Glaswände und stoßen sich gegenseitig ab. Schütteln oder ein harter Aufprall löst sie, sie fallen auf den Glasboden. Kommt der Knopf zur Ruhe, setzen sie sich wieder zum Icon zusammen. | `S`, kräftig hin- und herziehen, werfen. Auf dem Handy: *📱 Enable* (Neigen = Schwerkraft, Schütteln) |
| 3 | **Dämmerungs-Uhr** | Der Schalter folgt dem echten Sonnenstand (NOAA-Formel). In der bürgerlichen Dämmerung (−6° … +4°) bleibt der Knopf *zwischen* den Zuständen stehen, und der Pixelschwarm hängt halb gemorpht in der Luft. Der Zeitraffer spielt einen Tag in 40 s ab. | `A` = Sonnenuhr, `T` = Zeitraffer. Panel: *📍 Use mine* für den echten Standort |

**Technik dahinter**
- Freier Knopf und Schwappen: Ein Starrkörper mit Federgriff wird geworfen und prallt mit Restitution ab.
  Die Pixel sind lose Teilchen im Knopf-Bezugssystem (`a = g − a_knopf`). Kollision über das SDF des
  abgerundeten Rechtecks, Pixel-Pixel-Trennung paarweise. Das Lösen wird über eine Schüttel-Energie
  ausgelöst, die die Summe der |Δv| zählt.
- Sonnenuhr: Ohne Standort wird die Länge aus der Standard-Zeitzone geschätzt, die Breite ist 50°N.

### Tastatur
`Space` umschalten / Knopf heimholen · `←` `→` setzen · `1`–`4` Icons · `R` Shuffle · `M` Ton · `A` Sonnenuhr ·
`T` Zeitraffer · `S` schütteln · `H` Panel

---

## Das Lab: 11 Interface-Elemente in der DNA des Toggles

Unter dem Toggle liegen sechs Glasperlen. **Jede Perle zeigt das echte Element**, gerendert von seinem
eigenen Shader. In Ruhe ist es ein Standbild, das beim Laden einmal unsichtbar gerendert und bei einem
Theme-Wechsel neu aufgenommen wird. Beim Hover läuft das Element live in der Perle und führt sich selbst
vor (Autopilot, stumm): Pour gießt, und die „Kamera“ folgt der Perle, Hold lädt sich auf und bestätigt,
Dial dreht, Tabs springen. Im Vorschau-Modus bekommt jedes Element ein **kompaktes Icon-Layout**, das komplett und zentriert in die Perle passt: Pour eine kurze Röhre, Lens ein kurzes Feld mit der Lupe hinter dem Wort, Tabs zwei Tabs, Drop eine einzelne Mulde, Bridge eine kurze Mulde, in der die Linsen im Autopilot zusammenfließen und wieder reißen, Stars drei Sterne, die sich im Autopilot nacheinander füllen, Picker kleinere Walzen, die im Autopilot geschnippt werden, Commit eine kurze Bahn, die sich im Autopilot selbst bestätigt, PIN nur die vier Zellen, die sich im Autopilot füllen und verschmelzen. Es läuft immer nur eine Live-Miniatur, gerendert in 160 px und auf 48 px
skaliert. Ein Klick öffnet das Element im Vollbild, kreisförmig aus der Perle heraus. `‹ ›`, die Punkte oder `[ ]` wechseln zwischen den Elementen, `←` bzw. `Esc` führt zurück.
Direktlinks: `#lab/pour`, `#lab/hold`, `#lab/dial`, `#lab/tabs`, `#lab/lens`, `#lab/drop`.

Eine erste Fassung mit 8 Natur-Simulationen wurde verworfen: Sie war nicht auf dem Niveau des Toggles
und verfehlte die Idee „ein gewöhnliches UI-Element wird außergewöhnlich“.

| Element | Was es ist | Interaktion |
|---|---|---|
| **Pour** | Lautstärke-Slider als Glasröhre voll flüssigem Licht. Die Oberfläche kippt und schwappt mit der Beschleunigung, die Farbe geht von Kaltblau über Violett zu Bernstein, das Licht blutet durchs Glas auf die Seite. Lautsprecher-Icon und Prozentzahl sind federnde Pixel. | Ziehen, Klicken, Scrollen, `← →`, `M`. Rasterklick alle 10 % |
| **Hold** | Halten-zum-Bestätigen als schwebende Pille aus klarem, dickem Glas: voll gerundeter Querschnitt wie ein Glasstab, Brechung pro Farbkanal (IOR 1,45 / 1,50 / 1,555) und leichte laterale Farbsäume, Fresnel-Rand, Totalreflexions-Band, Glanzpunkt, der dem Cursor folgt. Ein Lichtband läuft im Uhrzeigersinn um den Rand (exakte Bogenlänge der Stadionform), ein Herzschlag wird schneller, das Label füllt sich. Bei 100 %: Flash, Schockwelle, Funken, „HOLD“ wird zum Häkchen. | Halten (Maus, Touch, `Space`). Zu früh loslassen: Das Licht läuft zurück, die Pille schüttelt den Kopf |
| **Dial** | Glas-Thermostat 10–30 °C. 41 LED-Segmente von Frostblau zu Glut. Der Knopf ist eine Glas-Halbkugel: Brechung pro Farbkanal (IOR 1,38 / 1,50 / 1,68) mit ausgeprägter chromatischer Aberration auf Punktraster und Pixel-Temperatur, Fresnel-Rand, der den LED-Ring spiegelt, Totalreflexions-Band, Kaustik im Schatten, eingeschlossener Leuchtpunkt als Zeiger. | Drehen mit Rastern (Klick + Haptik), Flick mit Schwung, weiche Anschläge, Scrollen |
| **Tabs** | Segment-Control, dessen Linse ein Glastropfen ist: Kopf und Schwanz per Smooth-Min verschmolzen, ein Hals hält sie beim Strecken zusammen. Das gewählte Wort wächst per Pixel-Morph, die Farbe wandert mit, ein Lichtband liegt an der Unterkante. | Klicken, Linse ziehen und einrasten lassen, `← →` |
| **Lens** | Suchfeld mit einer Glaslupe auf dem Cursor. Jeder Buchstabe wirbelt als Pixel aus der Lupe an seinen Platz (Klick in eigener Tonhöhe, Lupe wackelt), Backspace lässt ihn herausfallen, × oder Esc lässt alles zerstieben. **Sucht wirklich im Lab:** Die Vervollständigung erscheint als blasse Pixel, `Tab` oder `→` übernimmt sie, `Enter` öffnet das Element („TOGGLE“ führt zurück). Ohne Treffer schüttelt die Lupe den Kopf und das Licht wird bernsteinfarben. Das Filament wandert mit der Textlänge. Ein echtes, unsichtbares `<input>` sorgt für die Handy-Tastatur und Barrierefreiheit. | Tippen, `Tab`/`→`, `Enter`, `Esc`, × |
| **Drop** | Checkliste, bei der jedes Häkchen ein Tropfen flüssiges Glas ist, konsequent **in Draufsicht**. Beim Hover sammelt sich ein runder, zitternder Tropfen über der Mulde. Abhaken: Er fällt von der Kamera weg, wird dabei kleiner, sein Schatten zieht sich unter ihn zusammen, dann landet er und breitet sich zu einer runden Perle aus, die nachwackelt. Dazu Spritzer, Wellenring, Kaustik und „Plip“. Durch die Perle blüht ein Pixel-Häkchen auf, ein Lichtfaden streicht die Aufgabe durch. Rückgängig: Der Tropfen steigt zur Kamera auf und verdunstet. Alle erledigt: Die Tropfen leuchten nacheinander auf, mit Akkord und Schockwelle. | Klicken, `1 2 3`, Hover |
| **Bridge** | Bereichs-Slider mit zwei Glaslinsen, in Draufsicht. Beide Linsen sind **ein** Glaskörper (Smooth-Union) mit Brechung pro Farbkanal; unter jeder Linse steht ihr Grenzwert als Pixel. Dazwischen fließt eine Brücke aus flüssigem Licht durch die Mulde, mit wandernden Lichtperlen, kühl am unteren und warm am oberen Wert; die Skalenpunkte im Bereich leuchten mit. Nähern sich die Linsen, wölben sie sich einander entgegen und verschmelzen zu einem Tropfen mit „Plip“, Wackeln und gemeinsamer Zahl („40-45“). Auseinandergezogen reißt der Tropfen mit Pop und Funken; je weiter weg, desto dünner wird die Brücke, bis sie flackert. Jede Linse trägt ein Filament (unten bei 0, oben bei 100), dazu Streckung beim Ziehen, Rasterklicks alle 5, Funken an den Enden. Die Brücke packen verschiebt den ganzen Bereich; schiebt man eine Linse über die andere, schiebt sie diese mit. | Ziehen, Klick auf die Mulde, `← →`, `⇧← →` |
| **Stars** | Bewertung aus fünf **geschliffenen Glassternen** in Draufsicht: zehn Facetten mit Graten zu den Spitzen, abgerundeter Rand, Brechung pro Farbkanal. Beim Darüberfahren läuft flüssiges Licht wie ein Pegel von Stern zu Stern, mit wackelndem Meniskus in einem halb gefüllten Stern und einem leisen Klick bei jedem Stern. Die Farbe wird mit der Bewertung heißer, von Glutrot bei einem bis Weißgold bei fünf Sternen. Leuchtende Sterne werfen Licht in die Mulde und funkeln mit sanften Beugungsstrahlen. Antippen lässt die Sterne nacheinander aufspringen; fünf Sterne lösen eine Kettenreaktion mit Akkord, Funken und Schockwelle aus. Darunter steht das Urteil in Pixeln (MEH … WOW). Erneutes Antippen löscht die Bewertung. | Hover, Klick, `← →`, `0–5` |
| **Picker** | Zeitauswahl aus zwei Walzen mit Pixelzahlen (Stunden, Minuten) unter einem **liegenden Glasstab**. Der Stab ist eine Zylinderlinse: Er vergrößert die gewählte Zeile, Blau etwas stärker als Rot, sodass die Kanten farbig ausfransen, und staucht, was unter seinen Rändern liegt. Abseits des Stabs biegt sich die Walze weg: Zeilen werden kürzer, weicher und farbgesäumt. Licht wird an den Enden in den Stab eingespeist wie in einen Lichtleiter; seine Farbe ist der Himmel zur gewählten Uhrzeit (Nachtblau, Morgenrot, Mittagsweiß, Abendrosa), darunter die Tageszeit in Pixeln. Ziehen oder Schnippen: Die Walze läuft mit Schwung aus, klickt bei jeder Zeile und rastet mit leichtem Überschwingen ein. | Ziehen, Schnippen, Tippen auf eine Zeile, Scrollen, `↑ ↓`, `← →` |
| **Commit** | Wischen zum Bestätigen, für Dinge, die man nicht zurücknehmen kann. Eine Glaslinse in einer Mulde, dahinter schimmert „SLIDE TO SEND“. Ziehen ist Arbeit: Die Bahn wird zum Ende hin immer zäher, hinter der Linse füllt sich die Mulde in voller Höhe mit flüssigem Licht, heller und heißer (Blau → Pink), die Klicks steigen in der Tonhöhe und die Linse beginnt zu zittern. Die Buchstaben weichen der Linse aus. Zu früh losgelassen, federt sie zurück und das Licht läuft leer. Am Ende entlädt sich die Spannung: Schockwelle, Funken, Akkord, der Pfeil in der Linse wird zum Häkchen, das Licht flutet die ganze Mulde, darauf steht „SENT“. | Ziehen, `Enter`/`Space` |
| **PIN** | Code-Eingabe mit vier Glaszellen in einer Mulde und einem Tastenfeld aus runden Glasknöpfen. Jede Ziffer wirbelt als Pixel in ihre Zelle und faltet sich kurz danach zu einem Punkt. Das Filament des Toggles umkreist die nächste Zelle. Falscher Code: Die Zellen schütteln sich nacheinander gummiartig, glühen rot und die Pixel stieben davon. Richtiger Code (2580): Die Zellen fließen zu einem einzigen Glasstreifen zusammen, „UNLOCKED“, Akkord und Schockwelle; danach entzündet sich oben in der Mitte ein neues Filament, wächst mit dem Verschmelzen und läuft um den ganzen Streifen. Das Licht folgt der Kontur nach Strecke, also überall gleich schnell und gleich lang. | Tastenfeld, `0–9`, `⌫` |

### Dieselbe Erfahrung wie der Toggle
- **Umlaufendes Lichtfilament** mit exakt der Bahnlogik des Toggles (`Orbit`): Bei Pour liegt es
  bei 0 % unten und bei 100 % oben, bei Tabs von DAY unten bis YEAR oben, jeweils über die führende
  Seite. Bei Dial zeigt es auf den Wert.
- **Körper wie der Toggle-Knopf**: Squash & Stretch mit Geschwindigkeit, Quetschen am Anschlag,
  Hover-Lift, Absinken beim Drücken, Jelly-Nachwippen.
- **Scheue und nachziehende Pixel**, **Licht-Kick** bei Interaktionen, **Luft-Sound**, der der
  Geschwindigkeit folgt, Glas-Ping, Funken, Schockwelle, Glanz-Wischer.
- **Dieselbe Seite**: Himmelsverlauf und Sternenfeld mit Pointer-Parallaxe, Hinweis-Zeile in gesperrten
  Versalien.

### Gemeinsame Glas-Engine (`src/lab/glass/`)
- `lib.glsl.js`: dieselbe Optik wie der Toggle als Bibliothek. Glow-Modell (additiv auf Dunkel, getönt
  auf Hell), Mulde, Schatten, Pixel-Tinte mit Frost und chromatischer Aberration, Glas-Shading mit
  Pointer-Licht.
- `domeLens(...)`: ein generierter GLSL-Baustein für klare Glaslinsen und Tropfen (Ellipsoid-Kappe) mit
  Brechung pro Farbkanal, Fresnel, Totalreflexions-Band, Kantenlicht, Cursor-Glanz, Fensterspiegelung und
  optionaler Färbung. Lens und Drop nutzen ihn.
- `engine.js`: Stage (ein WebGL2-Canvas pro Element, Design-Raum-Skalierung, Pixel-Layer scharf und
  weichgezeichnet als Texturen), `PixelMatrix` (Glyph-Morph per Winkel-Pairing und Federn, wie Mond→Sonne),
  3×5-Pixelfont, Sound über das Audio-Kit des Toggles.
- Die Elemente übernehmen das Theme der Toggle-Seite, also Hell oder Dunkel.

### Gemeinsames Finish & Lab-Chrome
- **Ton-Finish für alle Elemente** (`finish()` in `lib.glsl.js`): Überbelichtetes Licht läuft weiß-heiß aus statt
  gesättigt zu clippen, darüber eine weiche Film-Schulter (nur im Dunkeln; das Helle bleibt Papier), eine leise
  Vignette und Korn. Jedes Element wirft außerdem einen schwachen Pool seines Lichts auf den Boden.
- **Die Lab-Chrome folgt dem Theme stufenlos** (Titel, Zurück-Knopf, Navigation, Hinweis, Bühnenfarbe), wie die Perlen.
- **Wechsel zwischen Elementen blenden über:** Das alte Element läuft während des Ausblendens weiter, der Titel gleitet ein.
- Alle Gestaltungsregeln für neue Elemente stehen in [DESIGN.md](DESIGN.md).

### Architektur & Performance
- `shelf.js` montiert **genau ein** Element. Die Render-Schleife des Toggles pausiert, solange das Lab offen ist.
- **Keine Ruckler beim Laden oder Öffnen:** Shader werden mit `KHR_parallel_shader_compile` abseits des
  Haupt-Threads kompiliert (`glProgramAsync`). Jedes Element wartet beim Öffnen auf seinen fertigen Shader.
- **Pixel-Ebene nur bei Änderung:** Ein billiger Recorder bildet pro Frame eine Signatur der Pixel-Zeichnung.
  Ist sie unverändert, entfallen Neuzeichnen, Weichzeichnen und Upload. Im Ruhezustand kostet ein Element
  etwa 0,15 ms CPU pro Frame, unter voller Interaktion etwa 0,5 ms.
- **Standbilder der Perlen:** Hell und Dunkel stammen aus demselben Frame (kein Geisterbild beim Überblenden).
  Sie werden in `localStorage` gecacht (`STILLS_VERSION` in `shelf.js` erhöhen, wenn sich der Look ändert)
  und nur erzeugt, wenn kein Element offen ist.
- Module werden lazy geladen. `dispose()` gibt Loop, Listener, Timer-Warteschlangen, Texturen und den
  WebGL-Kontext frei. Gemessen: 15 Öffnen-und-Schließen-Zyklen und 30 schnelle Hover-Wechsel ohne Rückstände.
- `?perf` in der URL: `window.labPerf` misst die CPU-Zeit pro Frame der Lab-Elemente.
- `prefers-reduced-motion` dämpft Animationen und schaltet den Kreis-Reveal und die Live-Vorschauen ab.

## Dateien
- `src/shader.js` – der komplette Fragment-Shader
- `src/main.js` – Physik, Pixel-Simulation, Funken, Input, GL-Setup
- `src/icons.js` – Pixel-Icons und Pairing
- `src/audio.js` – Sound-Synthese
- `src/sensors.js` – Geräte-Neigung und -Schütteln
- `src/sun.js` – Sonnenstand
- `src/params.js` / `src/panel.js` – Parameter, Schema, UI
- `src/lab/` – Lab: `shelf.js`, `registry.js`, `previews.js`, `kit.js`, `glass/` (Engine), `exp/*.js` (4 Elemente)
