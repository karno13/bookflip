# Sesja kreatywna (2026-11-22, wieczór): co naprawdę ogranicza wynik właściciela

Status: **hipotezy i zaprojektowane eksperymenty; w tej sesji nie było dostępu do uruchamiania kodu, więc na kopii `data/bookflip-catalog.sqlite` nic nie policzono** (tylko odczyt zaplanowany, nazwy tabel sprawdzone w `docs/SCHEMA.sql`). Liczby w tekście pochodzą z `CHANGELOG.md` i `2026-11-22-pomiary-na-kopii.md`, reszta to hipotezy.

## Wniosek z dzisiejszych odrzuceń

Odrzucone dziś pomysły (stan, literówki, lejek szczegółów) szukały **nowego sygnału cenowego** w ofertach, które już widzimy. Żaden nie pytał, **czego nie widzimy** i **jak szybko**. Skoro ceny nie dają dźwigni, ograniczeniem są najpewniej: (a) pokrycie, (b) czas reakcji, (c) zaufanie do wyceny i (d) droga od alertu do zakupu. Poniżej pomysły z tych czterech osi. „Dziś” = da się zmierzyć na kopii; „historia” = potrzeba więcej tygodni snajpera (kopia ma ok. 21 dni, statusy od 10.11).

## Pomysły

### Pokrycie (czy w ogóle widzimy oferty)

1. **„Ciemna materia”: oferty uniwersów bez rozpoznanego wydania.** Teza: okazja powstaje tylko przy ofercie z aktywnym dopasowaniem do wydania (ISBN), a Vinted rzadko podaje ISBN; więc najlepsze oferty Warhammera/Dragonlance mogą być niewidoczne w „Okazjach” dlatego, że są nierozpoznane, nie dlatego, że ich nie ma. Eksperyment (dziś): policzyć oferty Vinted z tytułem pasującym do regexu uniwersów (ten sam co w pomiarach #2/#3) i podzielić na: z aktywnym dopasowaniem do wydania / tylko dopasowanie tytułowe do dzieła („wydanie nieustalone”) / bez żadnego. Kryterium: jeśli ≥ 40% ofert uniwersów nie ma wydania, wąskim gardłem jest rozpoznawanie, a nie skan; wtedy kolejny krok to podpowiedź z okładki/tytułu dla właśnie tych ofert (nie przypisanie, tylko pole ISBN do potwierdzenia).
2. **Estymata niewidzianych ofert (schwytaj-i-złap ponownie).** Teza: nie wiemy, jaki odsetek ofert Vinted z uniwersów widzimy. Dwa niezależne „aparaty” (np. profil „Dragonlance po polsku” vs fraza ogólna „Dragonlance”; lub fraza snajpera vs ręczny skan) znajdują część ofert; z nakładania się (`offers.matched_queries_json`) szacuje się całość (Lincoln-Petersen). Inspiracja: ekologia, liczenie populacji zwierząt. Eksperyment (dziś): n1, n2, n12 dla par fraz na ofertach Vinted z ostatnich 20 dni. Kryterium: szacowane pokrycie < 70% = jest luka do zamknięcia (nowe frazy, głębsze strony); ≥ 90% = pokrycie nie jest problemem, nie rozbudowywać fraz. Zastrzeżenie: frazy nie są niezależne (pozytywna korelacja zawyża pokrycie), więc wynik to górne ograniczenie.
3. **Skan po sprzedawcy zamiast po frazie.** Teza: kto wystawia jeden Warhammer, zwykle wystawia ich więcej (porządki w biblioteczce); strona sprzedawcy to jedno zapytanie przez bramkę zamiast wielu fraz, a oferty bez słowa uniwersum w tytule („Dzieci Horusa”) też się znajdą. Dziś: policzyć sprzedawców (`offers.seller_id`) z ≥ 2 ofertami uniwersów i odsetek ich pozostałych ofert w katalogu (książek, których fraza nie złapała). Kryterium: ≥ 30% sprzedawców z uniwersami ma ≥ 3 książki, a ≥ 20% ich książek było znalezione dopiero po fakcie. Uwaga: poprzedni pomiar (sprzedawcy z ≥ 3 ofertami nie są tańsi) dotyczył ceny, nie pokrycia. Wymaga rozpoznania adresu strony sprzedawcy i zgodności z regulaminem; tylko przez bramkę.

### Szybkość (czy jesteśmy pierwsi)

4. **Opóźnienie wykrycia.** Teza: rozstrzyga nie cena, a to, czy oferta jest widziana w minutach, czy w godzinach. Eksperyment (dziś, tylko oferty z datą wystawienia, po naprawie „wczoraj” — ok. 63–70% Vinted): `first_seen_at` minus data wystawienia, osobno dla ofert z `deal_alerts` i bez, według źródła (Vinted vs reszta). Kryterium: mediana opóźnienia ≤ 30 min dla ofert snajpera = szybkość nie jest problemem; > 3 h = interwał/lista celów jest wąskim gardłem. Zastrzeżenie: wiek na Vinted jest zgrubny („2 godz.”, „wczoraj”), więc rozdzielczość to ok. godzina; mierzyć kwantylami, nie średnią.
5. **Okno przewagi z czasu życia okazji.** Teza: jeśli okazje (cena ≤ 0,8 wyceny) znikają mediana < 6 h, każda minuta alertu się liczy i warto skrócić interwał dla najlepszych celów; jeśli wiszą dni, można skanować rzadziej i oszczędzić bramkę. Dziś: czas od `first_seen_at` do `availability_changed_at` dla ofert `sold`/`unavailable` w grupie „okazja” (cena/wycena ≤ 0,8) vs reszta; skan w historii statusów dopiero od 10.11, więc **pełny wynik: historia**, wskazówka dziś. Kryterium: mediana okazji krótsza o ≥ 30% niż reszty i < 24 h.
6. **„Duchy”: oferty, które pojawiły się i zniknęły między skanami.** Teza: oferta, której pierwszy i ostatni zapis to to samo zdarzenie, a status od razu `sold`/`not_seen`, to okazja, której nie zdążyliśmy zobaczyć; ich odsetek to bezpośrednia miara utraconych okazji. Dziś: odsetek ofert Vinted z czasem życia < odstęp skanu (z `scan_runs`) wśród tych, które zniknęły. Kryterium: ≥ 15% zniknięć to „duchy” = interwał jest za długi; < 5% = nie ma co skracać.
7. **Interwał zależny od pory dnia.** Teza: napływ ofert Vinted nie jest równomierny (wieczory, weekendy); stały interwał 15–60 min marnuje żądania w nocy i jest za rzadki wieczorem. `inflow-profile.mjs` już liczy napływ. Dziś: rozkład nowych ofert (po dacie wystawienia) w godzinach. Kryterium: ≥ 60% napływu w ≤ 8 godzinach doby — wtedy interwał adaptacyjny oszczędza ≥ 30% żądań albo skraca czas reakcji o połowę w szczycie.
8. **Wydajność fraz (nowe oferty na żądanie) zamiast obrotu.** Teza: dziś wybór celów to obrót i wycena ≥ 25 zł; lepszą miarą jest, ile **nowych ofert w cenie poniżej wyceny** dała fraza na żądanie. Dziś: z `scan_runs.summary_json` i `matched_queries_json` policzyć nowe oferty i okazje na frazę. Kryterium: rozrzut wydajności ≥ 10× między frazami i obecne cele w górnej połowie nie dają więcej okazji niż dolna = przesunąć budżet; podobne wydajności = zostawić.

### Zaufanie do wyceny (próba)

9. **Dwa poziomy okazji: „pewna” i „do sprawdzenia”.** Fakt: 120 z 209 okazji ma wycenę o niskiej pewności, a w pasie 0,8–1,2 trafia 31% takich wycen bez sprzedaży. Teza: właściciel marnuje czas na okazje z n ≤ 3; „zgadywanka” powinna być wizualnie osobną listą, z jednym przyciskiem „sprawdź na Vinted: ile kosztują inne” zamiast liczby udającej wycenę. Dziś: dla okazji uniwersów rozkład liczby obserwacji `n` i odsetek `n ≤ 3`. Kryterium: ≥ 50% okazji uniwersów ma n ≤ 3 = rozdzielenie list ma sens; wtedy jedyną „wyceną” dla nich staje się cel „Kupuję do” ustawiany ręcznie (istniejąca funkcja).
10. **Rozstęp kwantylowy zamiast mediany dla małych prób.** Teza: przy n ≤ 4 mediana jest pozorem precyzji; pokazywać przedział (min–max aktualnych ofert) i liczyć okazję tylko, gdy cena jest poniżej **minimum** innych ofert. Dziś: ile z 202 okazji zostałoby po warunku „taniej niż każda inna dostępna oferta tego wydania”. Kryterium: zostaje 30–70% (wtedy filtr coś rozróżnia; 100% lub < 10% = bez wartości). To tani, odwracalny filtr bez zmiany wyceny.

### Droga alert → zakup (praca właściciela)

11. **Czy alert dochodzi do właściciela, zanim oferta zniknie.** Dziś: `deal_alerts` (`alerted_at`, `seen_at`) — odsetek alertów, które jeszcze nie były `seen`, i dla widzianych mediana czasu do `seen_at`; plus dostępność oferty w chwili pomiaru. Kryterium: ≥ 25% alertów zniknęło lub zmieniło stan przed `seen_at` = problem leży w dostarczeniu (powiadomienie, dźwięk, telefon przez Tailscale), nie w znajdowaniu. Przy 26 ogłoszonych okazjach to tylko wskazówka.
12. **Liczba kliknięć od alertu do „kup”.** Teza: karta okazji ma wiele informacji, ale decyzja to 3 liczby (cena, wycena z pewnością, czy to dokładnie to wydanie). Eksperyment (dziś, bez bazy): przejść ścieżkę w UI i policzyć kliknięcia od alertu do otwarcia oferty Vinted oraz czy wszystko do decyzji jest na jednym ekranie; w `deal_triage`/`deal_verdicts` (dziś 0 wpisów) dopiero po tygodniu użycia będzie widać, ile razy właściciel odrzuca i dlaczego. Kryterium: > 2 kliknięcia lub konieczność wyjścia z karty po cenę nowego/liczbę obserwacji = przebudować kartę do „jednego rzutu oka”.
13. **Zbieranie prawdy od samego właściciela przy zerowym wysiłku.** Teza: wartościowsze od modeli są werdykty właściciela (`deal_verdicts`: dobra / zła pozycja / stan / zawyżona); są 4 przyciski, ale brak danych. Eksperyment (historia): po dwóch tygodniach użycia odsetek okazji z werdyktem i odsetek „zawyżona/zła pozycja” według pewności wyceny. Kryterium: ≥ 30% „zawyżona” przy niskiej pewności = obciąć okazje niskiej pewności do osobnej listy (patrz 9).

### Pytanie o produkt

14. **Rozstrzygnięcie nisza vs szeroki rynek z danych dziś dostępnych.** Fakt: to otwarta decyzja właściciela. Eksperyment (dziś): suma oczekiwanego zysku okazji w uniwersach vs poza nimi, osobno dla pewności medium/high; liczba okazji na 100 żądań do Vinted w obu grupach. Kryterium: jeśli szeroki rynek daje ≥ 2× więcej pewnych okazji na żądanie, uniwersa są hobby, nie źródłem dochodu — warto to powiedzieć właścicielowi wprost (**wymaga decyzji właściciela**, bo zmienia priorytet frazy).

## Ocena

| # | Pomysł | Wartość | Trudność | Ryzyko | Pomiar |
|---|---|---|---|---|---|
| 1 | Ciemna materia (nierozpoznane) | wysoka | niska (pomiar) | niskie | dziś |
| 2 | Schwytaj-i-złap pokrycia | wysoka | niska | średnie (korelacja fraz) | dziś |
| 3 | Skan po sprzedawcy | średnia–wysoka | średnia | średnie (źródło, bramka) | dziś (pomiar), potem pilotaż |
| 4 | Opóźnienie wykrycia | wysoka | niska | niskie | dziś (ok. 65% ofert z datą) |
| 5 | Okno przewagi | średnia | niska | niskie | historia (od 10.11) |
| 6 | Duchy | wysoka | niska | niskie | dziś (przybliżenie) |
| 7 | Interwał dobowy | średnia | średnia | niskie | dziś |
| 8 | Wydajność fraz | średnia | niska | niskie | dziś |
| 9 | Okazje pewne i do sprawdzenia | średnia–wysoka | niska | niskie | dziś |
| 10 | Minimum zamiast mediany | średnia | niska | niskie | dziś |
| 11 | Alert dochodzi przed zniknięciem | wysoka | niska | niskie | dziś (n=26), potem historia |
| 12 | Kliknięcia do zakupu | średnia | niska | niskie | dziś (audyt UI) |
| 13 | Werdykty właściciela | wysoka | niska | niskie | historia |
| 14 | Nisza vs szeroki rynek | wysoka | niska | wymaga decyzji | dziś |

## Trzy najlepsze

1. **Pomysł 1 (ciemna materia) razem z 14.** Najtańszy i najbardziej rozstrzygający: jeśli większość ofert uniwersów nie ma rozpoznanego wydania, żadna poprawa skanu ani wyceny nie pomoże, bo okazja po prostu nie powstaje. Pierwszy eksperyment i kryterium powyżej (≥ 40% nierozpoznanych = wąskie gardło). Dopiero wtedy ma sens pomysł 9 dla tych ofert.
2. **Pomysły 4 + 6 + 11 jako jeden pomiar „czy jesteśmy pierwsi”.** Opóźnienie wykrycia, odsetek duchów i odsetek alertów, które znikają przed obejrzeniem; razem mówią, czy ograniczeniem jest interwał snajpera, czy dostarczenie alertu do człowieka. Kryteria: mediana opóźnienia ≤ 30 min, duchy < 5%, alerty niewidziane < 25% = szybkość nie jest problemem i nie skracamy interwału.
3. **Pomysł 2 (schwytaj-i-złap pokrycia).** Jedyna droga do liczby „ile pomijamy” bez zewnętrznej prawdy; wynik decyduje, czy dokładać frazy/strony (i budżet bramki), czy przestać.

## Założenia, które kwestionuję

- **„Okazja = oferta poniżej wyceny wydania z ISBN”.** To zakłada, że oferta jest rozpoznana; na Vinted często nie jest (pomysł 1). Niewidoczne okazje nie pojawiają się w żadnej statystyce skuteczności.
- **„Wycena (liczba) to dobry sposób pokazania ufności”.** Przy n ≤ 3 liczba udaje wiedzę; przedział albo osobna lista „do sprawdzenia” jest uczciwsza.
- **„Kolejne sygnały cenowe poprawią wynik”.** Trzy dzisiejsze porażki sugerują, że cena w ofertach jest już wyczerpana; zostają pokrycie, szybkość i praca człowieka.
- **„Skracanie interwału snajpera to zawsze zysk”.** Bez pomiaru opóźnienia i duchów może to być tylko dodatkowe obciążenie bramki.
- **„Wiek oferty z Vinted to dokładna data”.** To etykieta zgrubna; wnioski o „pierwszeństwie” w minutach są nieuprawnione.

## Kogo zapytać

- **catalog-specialist:** gdzie w bazie widać dopasowanie tytułowe vs ISBN (dla 1) i czy `matched_queries_json` zapisuje frazę snajpera (dla 2, 8).
- **scanner-specialist:** czy strona sprzedawcy Vinted jest dostępna zgodnie z regulaminem i bramką (3) oraz czy skan frazowy zapisuje dzień i źródło (warunek z pomiaru „powrót rzadkości”).
- **data/market:** uruchomić 1, 4, 6, 11, 14 na kopii (nic nie uruchomiono w tej sesji).
- **UX:** audyt kliknięć od alertu do zakupu (12).

## Co wymaga decyzji właściciela

- Pomysł 14, jeśli wynik zmieni priorytet fraz (nisza vs szeroki rynek).
- Pomysł 3, jeśli miałby czytać strony sprzedawców (nowy rodzaj zapytań; nadal przez bramkę).
- Reszta mieści się w obecnym kierunku.
