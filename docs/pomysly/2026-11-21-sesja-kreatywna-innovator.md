# Sesja kreatywna (2026-11-21): BookFlip projektowany od zera

Status: **pomysły i hipotezy, nic niewdrożone.** Autor: product-innovator. Temat: jak wyglądałby produkt, który wyznacza nowy standard w swojej kategorii, gdyby nie trzeba było zachować obecnego sposobu działania.

Fakty z repozytorium (CLAUDE.md, PRODUCT-DIRECTION.md, CHANGELOG, `market-index.mjs`) oznaczam jako **[fakt]**, resztę jako **[hipoteza]**. Nie czytałem prawdziwej bazy; liczby z innych notatek (np. 5283 ofert, ok. 50% rozpoznanych w `dobor-fraz-z-wynikow-skanowania.md`) są cudze i sprzed kilku dni.

## Obraz wyjściowy

Dziś BookFlip jest „skanerem z katalogiem”: **frazy → oferty → ISBN → wycena → okazje**. Kolejka decyzji i identyfikacja to koszt, który właściciel płaci, żeby w ogóle wycenić ofertę. Przy projektowaniu od zera odwróciłbym trzy rzeczy:

1. Punkt wyjścia to **popyt i cena transakcyjna**, a nie lista fraz.
2. Skaner jest jednym z kilku **dostawców sygnału**, nie jedynym wejściem.
3. Wynik to **zalecenie z mierzoną skutecznością** („kup do X zł, szansa Y”), którego trafność system sam sprawdza.

## Pomysły (dywergencja, bez oceny na tym etapie)

### 1. Kalibracja i backtest okazji („Brier score dla Okazji”)

- **Teza:** wartością produktu jest nie lista okazji, tylko wiedza, jak często jej rankingowi można ufać; system sam mierzy, czy okazje z góry listy faktycznie znikają z Vinted szybciej niż reszta.
- **Dla kogo/problem:** właściciel nie wie, czy „oczekiwana korzyść = oszczędność × szansa” cokolwiek przewiduje, czy tylko wygląda wiarygodnie.
- **Inspiracja:** prognozowanie pogody i giełda (backtesting, kalibracja prawdopodobieństw), A/B testy w reklamie.
- **Pierwszy tani eksperyment:** skrypt offline na **kopii bazy** (jak `query-yield-report`): dla okazji z historii zebrać, jaki odsetek zniknął w 7/30 dni, w podziale na decyle rankingu. Brak monotoniczności = model do poprawy. Zero nowych żądań sieciowych.
- **Co zmienić:** potrzebny zapis historii okazji z chwilą ogłoszenia (może już istnieje w `deal-alerts` / obserwacjach ofert, do sprawdzenia).
- **Ocena:** wartość wysoka, trudność niska, ryzyko niskie (zniknięcie oferty nie musi znaczyć sprzedaży; może to być usunięcie lub rezerwacja).

### 2. Krzywa „cena → szansa sprzedaży” zamiast jednej liczby na wydanie

- **Teza:** wycena powinna odpowiadać na pytanie „po ile i jak szybko”, czyli P(sprzedaż w 30 dni | cena), a nie podawać jedną medianę.
- **Dla kogo/problem:** indeks daje szansę dla wydania jako całości; dwa ogłoszenia tej samej książki za 20 i 45 zł mają inną szansę, a właściciel to dziś musi zgadywać.
- **Inspiracja:** rynek aut używanych (dni na placu vs. odchylenie od ceny rynkowej, np. wyceny w serwisach ogłoszeniowych), analiza przeżycia w medycynie, dynamiczne ceny linii lotniczych.
- **Eksperyment:** na kopii bazy dla 20 wydań z największą liczbą obserwacji policzyć odsetek zniknięć w 30 dni w trzech przedziałach ceny względem mediany. Jeśli różnice są duże i spójne, krzywa ma sens.
- **Zmiana:** rozszerzenie `market-index.mjs` o podział po cenie względnej; ewentualnie tabela pochodna.
- **Ocena:** wartość wysoka, trudność średnia, ryzyko średnie (mała próba na wydanie; potrzebne wygładzanie hierarchiczne wydanie → dzieło → autor).

### 3. „Tryb łowcy”: skan ISBN telefonem w terenie (kiermasze, wyprzedaże bibliotek, antykwariaty, second-handy)

- **Teza:** największa przewaga w arbitrażu książkowym to źródło, którego nie widzą inni; półki stacjonarne omijają zablokowane Allegro/OLX i wszystkie bramki, a BookFlip ma już indeks rynku, który odpowiada „ile to warte i jak szybko się sprzeda”.
- **Dla kogo/problem:** właściciel przy półce nie ma żadnej pomocy; telefon dziś otwiera tylko ten sam interfejs (Tailscale **[fakt]**, `docs/TAILSCALE.md`).
- **Inspiracja:** aplikacje skautingu dla sprzedawców Amazon FBA (skan kodu kreskowego → natychmiastowa wartość), aplikacje do wyceny kart sportowych.
- **Eksperyment:** jedna strona statyczna z `BarcodeDetector` (przeglądarka telefonu) wysyłająca ISBN do istniejącej trasy wyceny; wynik: cena wydania z Vinted, szansa 30 dni, próg „biorę do X zł”. Test: 20 książek na własnej półce, porównanie z ręcznym szukaniem.
- **Zmiana:** nowy widok mobilny, trasa „odpowiedź dla ISBN” bez zapisu; to nadal porównanie ceny z wyceną, bez kosztów i zysku, ale **zahacza o odłożone funkcje handlowe, więc wymaga decyzji właściciela** (źródło stacjonarne, cena zakupu wpisywana ręcznie).
- **Ocena:** wartość wysoka (nowe, niedostępne dla konkurencji źródło), trudność niska–średnia, ryzyko niskie. Wymaga wykrywalnego kodu w przeglądarce (Chrome Android obsługuje, iOS Safari różnie; hipoteza).

### 4. Czytnik zdjęć ofert (grzbiety, okładki, strona redakcyjna)

- **Teza:** połowa ofert pozostaje bez ISBN (**[hipoteza]**: ok. 50% rozpoznanych w raporcie z 16.11); zdjęcie często go zawiera lub pozwala rozpoznać okładkę.
- **Dla kogo/problem:** kolejka decyzji, która dziś zjada codzienny czas właściciela.
- **Inspiracja:** Google Lens, Vivino (rozpoznawanie etykiet wina), systemy rozpoznawania kart (Delver Lens).
- **Eksperyment:** bez AI w chmurze: porównanie skrótu percepcyjnego (dHash) miniatury oferty z okładkami z metadanych znanych wydań; na 50 nierozpoznanych ofertach sprawdzić, w ilu przypadkach dokładnie jedno wydanie jest bliskie. Wynik tylko jako **propozycja** w kolejce (reguła „ISBN evidence only” zostaje; okładka nie przypisuje, tylko podpowiada).
- **Zmiana:** nowy sygnał w kolejce weryfikacji; cache okładek już istnieje **[fakt]** (trasy `/api/cover`). Użycie zewnętrznego modelu wizyjnego wysyłałoby zdjęcia poza komputer i wymaga decyzji właściciela.
- **Ocena:** wartość wysoka, trudność średnia–wysoka, ryzyko średnie (fałszywe zgodności między wydaniami z tą samą okładką).

### 5. Wycena cechowa dla książek bez ISBN (hedoniczna)

- **Teza:** gdy książki nie da się zidentyfikować, można ją wycenić po cechach (autor, seria, wydawca, rok, oprawa, objętość), tak jak wycenia się mieszkania.
- **Dla kogo/problem:** oferty „nieznane”, dziś tylko w „wydaniu nieustalonym” albo w kolejce.
- **Inspiracja:** wyceny nieruchomości (modele hedoniczne), AVM w ubezpieczeniach, wyceny kart kolekcjonerskich po stanie i dodruku.
- **Eksperyment:** regresja na rozpoznanych wydaniach (cena ~ seria + wydawca + rok + oprawa), leave-one-out; sukces, jeśli mediana błędu bezwzględnego jest mniejsza niż rozrzut cen w obrębie dzieła.
- **Zmiana:** nowy moduł wyceny „orientacyjnej”, wyraźnie oznaczany jako szacunek bez ISBN (nie przypisanie).
- **Ocena:** wartość średnia, trudność średnia, ryzyko średnie (rozmycie zasady dowodu ISBN, jeśli wycena trafi do rankingu okazji bez oznaczenia).

### 6. Księga zleceń: rynek jako dwustronna giełda

- **Teza:** dla każdego wydania pokazywać jak giełda: strona podaży (żywe oferty z ceną i czasem wiszenia), strona popytu (zniknięcia i ulubione), spread i „głębokość”; książka staje się instrumentem, a decyzja prostą regułą.
- **Dla kogo/problem:** dziś „Rynek” to lista indeksu; brak obrazu, ile ofert wisi tuż nad ceną, po której się sprzedaje.
- **Inspiracja:** księgi zleceń na giełdzie, sprawozdania z handlu kartami (TCGplayer „market price” vs. „lowest listing”), Zillow.
- **Eksperyment:** jeden widok szczegółu wydania z histogramem cen żywych ofert i znacznikiem „zniknęło w ciągu 14 dni” dla zamkniętych; makieta na danych kopii.
- **Ocena:** wartość średnia, trudność niska–średnia, ryzyko niskie. Dobry sposób na pokazanie, czemu ranking jest taki, a nie inny.

### 7. Hurt zamiast detalu: paczki i zestawy jako osobny rynek

- **Teza:** ogłoszenia „paczka 15 książek” bywają źle wycenione, bo sprzedający nie liczy wartości pojedynczych tytułów; BookFlip może rozbić paczkę na tytuły i policzyć wartość sumaryczną.
- **Dla kogo/problem:** niewykorzystana klasa ofert (zestawy to dziś w katalogu osobny temat, ale nie źródło okazji).
- **Inspiracja:** aukcje palet zwrotów (Amazon liquidation), skup partii na giełdach staroci, „bundle arbitrage” w grach.
- **Eksperyment:** policzyć w kopii, ile ofert ma w tytule „paczka/zestaw/komplet/lot” i ile z nich ma opis z wymienionymi tytułami; ręcznie wycenić 10 z nich indeksem. Bez nowych żądań.
- **Zmiana:** parser listy tytułów z opisu; zasada ISBN pozostaje (tytuły z paczki dostają tylko podpowiedź).
- **Ocena:** wartość średnia–wysoka, trudność wysoka (opisy chaotyczne), ryzyko średnie (opis rzadko jest pełny).

### 8. Nauka od zniknięć: „kto kupuje, jak szybko” jako sygnał dla snajpera

- **Teza:** snajper powinien optymalizować nie kolejność fraz, lecz **oczekiwany czas od wystawienia do pierwszego widzenia** (latencja), bo oferta, która znika w godzinę, jest warta tylko przy szybkiej reakcji.
- **Dla kogo/problem:** interwał 15–60 min **[fakt]** to założenie, nie pomiar.
- **Inspiracja:** handel wysokiej częstotliwości (latencja jako cecha produktu), monitoring SLA w logistyce.
- **Eksperyment:** z danych obserwacji obliczyć rozkład „wiek oferty w chwili pierwszego zobaczenia” (czas wystawienia Vinted minus pierwsze widzenie) i „czas życia” okazji. Jeśli mediana życia okazji jest rzędu godzin, interwał 15 min jest zasadny; jeśli dni, można skanować rzadziej (mniej żądań, mniejsze ryzyko blokady).
- **Ocena:** wartość średnia, trudność niska, ryzyko niskie.

### 9. Dwa tryby produktu: „radar” (pasywny) i „polowanie” (aktywne zadanie)

- **Teza:** zamiast jednego ekranu zakładek, dzienny rytuał: rano krótka lista 5–10 rzeczy „do zrobienia dziś” (okazje do kupienia, decyzje kolejki o największym wpływie, fraza do zmiany), z kosztem czasu przy każdej pozycji.
- **Dla kogo/problem:** właściciel pracuje w kolejce codziennie **[fakt]**; kolejność decyzji to dziś kubełki, nie wartość.
- **Inspiracja:** Superhuman/Linear (inbox zero i priorytetyzacja), systemy zgłoszeń z SLA, „next best action” w CRM.
- **Eksperyment:** posortować kolejkę po „wartości odblokowanej” (ile ofert rozpoznanych i ile okazji wejdzie do indeksu po rozstrzygnięciu) i sprawdzić na kopii, czy 20 pierwszych decyzji odblokowuje większość ofert.
- **Ocena:** wartość wysoka (oszczędza czas jedynej osoby pracującej), trudność niska–średnia, ryzyko niskie.

### 10. Szersze wejścia sygnału (poza skanem fraz)

- **Teza:** skaner pojedynczych fraz to wąskie gardło; sygnały można brać z list „nowości” sprzedawców, którzy często wystawiają książki (obserwacja profilu), z kategorii zamiast fraz (jak antykwariaty **[fakt]** `ANTIQUARIAN_SOURCES`) i z listy nowych wydań BN do przewidywania, co za chwilę trafi na rynek wtórny.
- **Inspiracja:** śledzenie „smart money” (obserwacja portfeli) w kryptowalutach, alerty o nowych wydaniach z kalendarzy premier.
- **Eksperyment:** z kopii wyliczyć, ilu sprzedawców wystawiło ≥5 ofert z okazjami; jeśli kilku daje większość okazji, taniej obserwować ich niż setki fraz. Tylko analiza, bez nowych zapytań. Każdy nowy odczyt przejdzie przez bramkę i może wymagać weryfikacji dostępu.
- **Ocena:** wartość wysoka, trudność średnia, ryzyko średnie (zasady serwisu i prywatność sprzedawców; wymaga przeglądu wobec `SOURCES-ACCESS`).

## Ocena zbiorcza

| # | Pomysł | Wartość | Trudność | Ryzyko |
| --- | --- | --- | --- | --- |
| 1 | Kalibracja okazji | wysoka | niska | niskie |
| 2 | Krzywa cena → szansa | wysoka | średnia | średnie |
| 3 | Tryb łowcy (telefon) | wysoka | niska–średnia | niskie (wymaga decyzji) |
| 4 | Czytnik zdjęć | wysoka | średnia–wysoka | średnie |
| 5 | Wycena cechowa | średnia | średnia | średnie |
| 6 | Księga zleceń | średnia | niska–średnia | niskie |
| 7 | Paczki jako rynek | średnia–wysoka | wysoka | średnie |
| 8 | Latencja snajpera | średnia | niska | niskie |
| 9 | Plan dnia / kolejka po wartości | wysoka | niska–średnia | niskie |
| 10 | Szersze wejścia sygnału | wysoka | średnia | średnie |

## Trzy najlepsze (według mnie)

1. **Kalibracja okazji (1), z krzywą cena → szansa (2) jako naturalnym ciągiem dalszym.** Najtańsze i najbardziej fundamentalne: bez niej cały silnik „oczekiwanej korzyści” jest nieweryfikowaną hipotezą, a z nią każdy kolejny ulepszony model da się porównać liczbą. Eksperyment to jeden skrypt odczytu na kopii bazy, w stylu `query-yield-report`.
2. **Tryb łowcy (3).** Jedyny pomysł, który otwiera źródło poza zablokowanymi marketplace'ami i nie zależy od bramki. Pierwszy test to jedna strona i 20 książek. Wymaga decyzji właściciela (granica z odłożonym handlem, ręczna cena zakupu).
3. **Plan dnia / kolejka po wartości odblokowanej (9).** Oszczędza czas jedynej osoby, która ręcznie weryfikuje codziennie, i jest tani. Zmienia kolejność pracy bez zmiany reguł identyfikacji.

Wyróżnienie: czytnik zdjęć (4) przyniósłby największy skok w rozpoznawaniu, ale najpierw sprawdzić wersję lokalną bez AI zewnętrznej.

## Założenia, które kwestionuję

1. **„Wejściem jest fraza”.** Przy ok. połowie rozpoznanych ofert i szumie od pojedynczych słów **[fakt z notatki o frazach]** to frazy, nie wyceny, są wąskim gardłem. Alternatywy: kategorie, sprzedawcy, teren.
2. **„Wycena jest jedną liczbą na wydanie”.** Szansa sprzedaży zależy od ceny; dlatego krzywa, nie mediana.
3. **„Brak kosztów i zysku, bo właściciel nie handluje”.** Ranking po „oszczędności × szansie” ignoruje prowizje, wysyłkę i czas; przy tanich książkach (kilka złotych różnicy) koszty mogą zmienić całą kolejność. Zakaz to decyzja właściciela, ale warto policzyć, ile okazji znika po odjęciu choćby stałej kwoty na sztukę; sama wiedza nic nie wdraża.
4. **„Online-only”.** Książki leżą też na półkach; nowy standard w kategorii to prawdopodobnie połączenie online i terenu.
5. **„Zniknięcie oferty = sprzedaż”.** Może być wycofanie, rezerwacja lub zmiana ceny; indeks rynku opiera się na tym sygnale **[fakt]**, więc warto zmierzyć jego jakość (np. czy oferty pojawiają się ponownie po tygodniu).
6. **„Nisza kontra szeroki rynek rozstrzygnie się z indeksu”.** Indeks mierzy tylko to, co skanują frazy z niszy; nie widzi wyniku dla szerokiego rynku bez próbkowania poza niszą. Do rozstrzygnięcia potrzebna jest próbka losowa, nie obecne frazy.
7. **„Człowiek rozstrzyga kolejkę po kolei”.** Wartość pojedynczej decyzji jest bardzo nierówna; kolejność ma znaczenie.
8. **„Ręczna wizja = bez zewnętrznej AI”.** Zasada braku zależności jest rozsądna dla kodu, ale nie dotyczy automatycznie decyzji o modelu lokalnym lub wywołaniu API; to osobna decyzja o prywatności danych.

## Do kogo z pytaniem

- **catalog-specialist:** czy skrót percepcyjny okładek (4) da się łączyć z cache okładek bez nowych żądań; czy zniknięcia ofert z ponownym pojawieniem się mieszają indeks (5. założenie).
- **scanner-specialist:** czy obserwacja list sprzedawców (10) mieści się w bramce i w `SOURCES-ACCESS`; jak liczyć latencję (8) z istniejących obserwacji.
- **product-triage:** czy backtest (1) i „plan dnia” (9) są zgodne z priorytetem „skaner, katalog, weryfikacja”; czy tryb łowcy (3) wymaga wpisu w „Settled”.
- **ui-ux-specialist:** makieta księgi zleceń (6) i ekranu „plan dnia” (9).
- **qa-reviewer:** jak testować kalibrację (1) tak, by liczby dało się odtworzyć na stałych danych testowych.

## Co wymaga decyzji właściciela

- Tryb łowcy (3): wprowadza ręczną cenę zakupu i źródło stacjonarne (granica z odłożonym handlem).
- Wyceny po kosztach (założenie 3): sprzeczne z „bez kosztów i prowizji”.
- Zewnętrzna AI do zdjęć (4): wysyłanie zdjęć poza komputer.
- Obserwacja sprzedawców (10): nowy rodzaj odczytu i ocena zgodności z regulaminem.

Pozostałe pomysły (1, 2, 5, 6, 8, 9) mieszczą się w obecnym kierunku produktu.
