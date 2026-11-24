# Mapa drogowa rozbudowy BookFlip (2026-11-21)

Cel: 6 dużych funkcji do zbudowania po kolei, każda w 1-2 cyklach agenta, używanych codziennie, służących handlowi książkami przez Vinted. Fakty: odczyt `CHANGELOG.md` 129-157, `docs/SCHEMA.sql`, `hunter.mjs` (jeszcze niezatwierdzony), `docs/pomysly/*`. Reszta to hipotezy. Zasady wspólne: bez nowych żądań poza bramką, bez kosztów i prowizji (chyba że zaznaczono), testy na `:memory:` z wstrzykniętym `fetcher`/`search`, migracja tylko gdy wskazana (następny numer: 140).

Zbudowane i niepowtarzane: plan dnia, Łowca (odczyt po ISBN), okazje z `priceDrop`, indeks rynku, snajper, kolejka z sortowaniem „Odblokowują najwięcej”, zdrowie danych, rozliczenie prognoz.

## Kolejność i zależności

1 Skrzynka okazji -> 2 Łowca: sesja w sklepie -> 3 Zarządzanie frazami -> 4 Karta wystawienia -> 5 Cena docelowa i alert -> 6 Paczki sprzedawców.
Zależności: 4 korzysta z wycen z `market-valuation.mjs` (jest), 5 z mechanizmu 1 (stan „obejrzane”), 6 z `seller_id` i wycen. Funkcje 1-3 nie zależą od niczego nowego; 4 i 5 można zamienić miejscami.

---

## 1. Skrzynka okazji (stan pracy nad okazją)

**Problem.** Okazje wracają w „Dziś” i „Okazjach” w kółko; właściciel nie ma jak powiedzieć „obejrzałem”, „odłóż do jutra”, „nie chcę tej”, więc każdego dnia przegląda to samo, a czasu reakcji nie da się zmierzyć.
**Dla właściciela.** W „Okazjach” i na karcie planu dnia trzy przyciski: Obejrzane / Odłóż (do jutra, do zmiany ceny) / Nie dla mnie. Obejrzane znikają z planu, odłożone wracają same, nowa obniżka ceny przywraca odrzuconą. Nagłówek: „3 nowe, 2 odłożone”; w „Dziś” mediana „ogłoszona -> obejrzana”.
**Dane i pliki.** `deal_alerts.seen_at` już jest; potrzebna migracja `140_deal_triage.sql` (tabela `deal_triage`: `offer_id`, `state` seen/snoozed/dismissed, `until`, `price_at` w groszach, `created_at`). Nowy `deal-triage.mjs`, wpis w `api-routes.mjs`, filtr w `deals.mjs` i `day-plan.mjs`, widok `app/views/deals.js`.
**Kryteria akceptacji.**
- Odrzucona oferta znika z `/api/deals` i planu; po spadku ceny poniżej `price_at` wraca z oznaczeniem „obniżka po odrzuceniu”.
- Odłożona wraca dokładnie po `until` (czas wstrzyknięty); ręczne cofnięcie stanu działa.
- Oferta, która zniknęła, nie liczy się do „nowych”; stan znika razem z ofertą (CASCADE).
- Mediana czasu reakcji liczona z `alerted_at` i `seen_at` na danych testowych.
- Stan nie wpływa na ranking, tylko na widoczność (ranking nietknięty: test na tych samych danych).
**Wartość / trudność / ryzyko:** wysoka / niska / niskie. Pierwszy eksperyment: sama kolumna `seen_at` przez „Obejrzane” w planie dnia, bez migracji.

## 2. Łowca: sesja w sklepie i na targu

**Problem.** `hunterLookup` odpowiada na jedno ISBN; w antykwariacie albo na wyprzedaży właściciel ogląda 30 książek i potrzebuje szybkiego „brać / nie brać” oraz sumy.
**Dla właściciela.** Zakładka „Łowca” (telefon przez Tailscale jako główny ekran): pole ISBN (aparat nie, wpisanie lub czytnik klawiaturowy), cena z półki, wynik: werdykt kolorem, wycena, szansa sprzedaży 30 dni, ile ofert jest teraz. Pod spodem lista sesji: kolejne pozycje, „Biorę” zaznacza, na dole suma cen i suma wycen zaznaczonych. Książka bez ISBN w katalogu: „nieznana, zapisz do sprawdzenia” i trafia do kolejki weryfikacji.
**Dane i pliki.** `hunter.mjs` + trasa w `api-routes.mjs`; sesja trzymana w przeglądarce (localStorage), bez migracji. Nowe: `app/views/hunter.js`, `index.html`, skrót w palecie.
**Kryteria akceptacji.**
- Wiele spellingów ISBN (10/13, myślniki) daje to samo wydanie; zły checksum daje `invalid_isbn`.
- Brak ceny = wynik bez werdyktu; cena >= 10 000 zł traktowana jak nieznana.
- Zero żądań sieciowych (test z `fetcher`, który rzuca).
- Suma sesji = suma pozycji „Biorę”, zaokrąglenia w groszach.
- Nieznane ISBN tworzy pozycję do sprawdzenia bez przypisania (tylko dowód ISBN).
**W / T / R:** wysoka / niska / niskie. Eksperyment: właściciel używa samego `hunterLookup` przez trasę na 20 książkach z półki i ocenia trafność werdyktów.

## 3. Zarządzanie frazami skanu (szum, luki, propozycje)

**Problem.** Frazy skanu decydują, co w ogóle widać (założenie „wejściem jest fraza” z sesji kreatywnej), a właściciel edytuje je na ślepo. Szum marnuje budżet bramki, luki ukrywają okazje.
**Dla właściciela.** Widok „Frazy”: tabela fraza / nowe oferty 14 dni / okazje / odsetek bez ISBN / ostatni skan. Przyciski „Wyłącz” (odwracalne, ślad w „Ostatnich decyzjach”) i „Dodaj”. Propozycje: autorzy i serie z dzieł o wysokim `turnover`, których nie pokrywa żadna fraza (z `docs/pomysly/dobor-fraz-z-wynikow-skanowania.md`).
**Dane i pliki.** `offer_queries`, `scan_runs.summary_json`, `scan_profiles`, `market-index.mjs`; nowy odczyt `phrase-stats.mjs`, widok `app/views/phrases.js`. Wyłączanie: pole w `scan_profiles` lub nowa migracja tylko, jeśli tabela nie ma flagi.
**Kryteria akceptacji.**
- Statystyki frazy policzone na zadanej bazie testowej (znane liczby).
- Fraza z >= 9 nowymi ofertami i 0 okazji w 14 dni oznaczona jako szum; poniżej progu próby (np. < 3 skany) oznaczona „za mało danych”.
- Wyłączona fraza nie jest skanowana ani przez pełny skan, ani przez snajpera; włączenie przywraca ją; ręcznie dodane frazy nigdy nie wyłączają się same.
- Propozycje nie zawierają fraz już obecnych (po normalizacji).
**W / T / R:** wysoka / średnia / niskie. Eksperyment: skrypt offline na kopii, który tylko wypisuje statystyki fraz.

## 4. Karta wystawienia (cena i opis do Vinted)

**Problem.** Po kupnie właściciel wycenia „na oko” i pisze opis od zera, a to jest kolejny dzienny koszt czasu i pomyłek ceny. Wystawianie towaru jest w zakresie kierunku produktu.
**Dla właściciela.** Na szczególe wydania przycisk „Wystaw”: sugerowana cena (trzy progi: szybka sprzedaż / środek / cierpliwie, z szansą 30 dni dla każdego z krzywej `liquidityModel`), liczba żywych konkurencyjnych ofert i ich najniższa cena, oraz gotowy do skopiowania tytuł i opis (autor, tytuł, wydawnictwo, rok, ISBN, pole na stan wybierane z listy). Kopiowanie jednym klikiem.
**Dane i pliki.** `market-valuation.mjs`, `market-index.mjs`, `catalog-api.mjs`; nowy `listing-card.mjs` (czysta funkcja) i trasa w `api-routes.mjs`; migracja niepotrzebna. Etykiety (funkcja istniejąca) mogą dostać to samo ISBN.
**Kryteria akceptacji.**
- Progi cen rosną monotonicznie, szansa maleje z ceną (test własności).
- Wydanie bez wiarygodnej wyceny: zamiast ceny komunikat „za mało ofert”, nie zgadywanie.
- Opis nie zawiera pól, których nie ma w katalogu (brak „null”, „undefined”); polskie znaki zachowane.
- Funkcja nie dotyka sieci.
**W / T / R:** wysoka / średnia / średnie (szansa wynika z założenia „zniknięcie = sprzedaż”; podawać jako orientacyjną). Eksperyment: wygenerować karty dla 20 wydań z kopii i ocenić ręcznie, czy środkowy próg jest sensowny.

## 5. Cena docelowa i alert „na liście”

**Problem.** Właściciel szuka konkretnych książek (zamówienie, seria, autor), a okazja liczona względem wyceny nie wie, ile jest gotów zapłacić.
**Dla właściciela.** Przy wydaniu lub dziele pole „Kupuję do … zł”. Gdy snajper lub skan znajdzie ofertę z ceną <= celu, trafia do skrzynki okazji (funkcja 1) z etykietą „Twoja cena”, niezależnie od wyceny rynkowej.
**Dane i pliki.** Migracja `14x_price_targets.sql` (`edition_id` lub `work_id`, `max_price` w groszach, `active`); rozszerzenie `deal-alerts.mjs` i `deals.mjs`; wymaga skrzynki z funkcji 1.
**Kryteria akceptacji.**
- Oferta z ceną <= celu ogłoszona raz (bez powtórzeń po kolejnym skanie), także gdy wycena jej nie uznaje za okazję.
- Cel dla dzieła obejmuje wydania polskie tego dzieła, nie obce.
- Cena >= 10 000 zł lub nieznana nie wyzwala alertu; zmiana celu przelicza przyszłe, nie cofa ogłoszonych.
- Dezaktywacja celu nie usuwa historii alertów.
**W / T / R:** średnia-wysoka / średnia / niskie. Uwaga: dotyka granicy „alerty zakupowe są odłożone”, ale na tej samej zasadzie co Okazje (cena kontra wartość określona przez właściciela); zalecane krótkie potwierdzenie właściciela.

## 6. Paczki sprzedawców

**Problem.** Sprzedawca z wieloma książkami opróżnia półkę, tanio i negocjowalnie; dziś widać pojedyncze oferty i traci się ten wzorzec (hipoteza E z `2026-11-21-dzis-i-nisza.md`).
**Dla właściciela.** Karta w „Okazjach”: „Sprzedawca X: 7 książek, razem 84 zł, wycena 190 zł”, z listą ofert i ich wycen. Sortowanie po sumie oszczędności.
**Dane i pliki.** `offers.seller_id` (indeks jest) z odczytem tylko SELECT: `seller-bundles.mjs`, trasa, widok. Bez migracji.
**Kryteria akceptacji.**
- Sprzedawca z < 3 ofertami z wyceną nie jest paczką; progi w stałych.
- Suma oszczędności liczy tylko oferty dostępne, z wiarygodną wyceną i bez ocenionych jako „zła zgodność”.
- Brak `seller_id` (puste) nie łączy ofert w jedną paczkę.
- Oferta, która zniknęła, wypada z sumy po następnym skanie.
**W / T / R:** wysoka / niska / średnie. Pierwszy eksperyment (pomiar): zapytanie na kopii, ilu sprzedawców ma >= 3 oferty z wyceną i jaka część oszczędności leży w paczkach. Jeśli < 15%, funkcja odpada. **Wymaga decyzji właściciela** tylko jeśli miałaby obejmować kontakt lub zakup paczek.

---

## Trzy najlepsze
1. Skrzynka okazji (daily, najtańsza, odblokowuje 5).
2. Łowca: sesja (używane w terenie, dane gotowe).
3. Zarządzanie frazami (steruje tym, co w ogóle widać).

## Założenia, które kwestionuję
- Że zespół ma szukać błędów zamiast dowozić: backlog wygląda na wyczyszczony (wpisy 119-157 to głównie poprawki), kolejne cykle powinny dawać funkcje.
- Że „alerty zakupowe” są wciąż odłożone: Okazje i snajper już działają jak alerty, a cena docelowa to ten sam mechanizm.
- Że wystawianie i sprzedaż są poza zakresem: kierunek produktu wymienia je wprost, a zysk z handlu powstaje przy sprzedaży.
- Że jedynym wejściem jest fraza skanu; widok fraz (3) i Łowca (2) dodają drugie wejście.
