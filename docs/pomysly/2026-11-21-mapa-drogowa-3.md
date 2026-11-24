# Mapa drogowa 3 (2026-11-21): od „mamy narzędzia” do „kupuję szybciej i trafniej”

Poprzednie: `2026-11-21-mapa-drogowa.md` i `-2.md` (zbudowane: skrzynka okazji, Łowca, frazy, karta wystawienia, cele, paczki, nawigacja grupami, snajper adaptacyjny, CSV i kopia, Zapas z przypomnieniami i kalibracją, raport tygodniowy, szukanie sprzedawców/autorów/serii, etykiety jako kolekcje, Łowca -> Zapas).

**Fakty** (odczyt `CHANGELOG.md` 171-184, `docs/SCHEMA.sql`, `docs/PRODUCT-DIRECTION.md`, mapy 1-2): istnieją `work_labels` (z `position` i `volume`), `edition_series.volume`, `price_targets` (zakres: wydanie albo dzieło), `stock_items` (z `offer_id ON DELETE SET NULL`), `offers.seller_id` z indeksem, `edition-gaps.mjs`. Ostatnia migracja to 145. **Nie czytałem** kodu `deals.mjs`, `label-collections.mjs`, `deal-triage.mjs` ani widoków; opisy ich działania poniżej to hipotezy do sprawdzenia przez wykonawcę. Wszystko, co dotyka ofert, jest liczone z już zeskanowanych danych; nowe żądania tylko przez `marketplace-gate.mjs` (istniejący skan, nic nowego nie obchodzi limitów).

**Wspólna ocena stanu:** zbudowano dużo wejść (okazje, cele, Łowca, Zapas), ale mało „zamknięć”: oferta -> decyzja -> sztuka -> wynik wciąż wymaga kilku przeskoków między widokami, a wycena (podstawa każdej decyzji) nie była nigdy sprawdzona na faktach. Mapa 3 domyka te dwie luki i dodaje kolekcje do pętli handlowej.

---

## 1. Szybki przegląd okazji z klawiatury (jedna oferta naraz)

**Problem.** Skrzynka okazji ma stany (obejrzane/odłóż/nie), ale lista wymaga klikania po wierszach; przy 20-50 nowych okazjach to najwięcej ręcznej pracy dziennie (hipoteza: do zmierzenia z `seen_at`).
**Widok.** Tryb „Przegląd” w Okazjach (przycisk i klawisz `R`): jedna oferta pełnym ekranem: okładka, tytuł, cena vs wycena, szansa 30 dni, konkurencja (żywe oferty tego wydania), link do Vinted. Klawisze: `K` kupiłem (-> Zapas), `L` do etykiety (menu), `O` odłóż, `N` nie dla mnie, `Z` cofnij, strzałki bez decyzji. Licznik „7 z 23”.
**Dane i pliki.** Bez migracji: korzysta z `deal-triage`, `stock`, `label-collections`. `app/views/deals-review.js` (kolejka w pamięci, żadnej nowej logiki rankingu), wpis w palecie poleceń.
**Kryteria (bez sieci).**
- Każdy klawisz wywołuje dokładnie to samo API co przycisk w liście (test porównujący żądania); kolejność = ranking „oczekiwanej korzyści” bez zmian.
- `Z` cofa ostatnią decyzję także po zmianie oferty; decyzja nie jest tracona przy odświeżeniu listy w tle.
- Oferta, która zniknęła w trakcie przeglądu, jest pomijana z komunikatem, nie błędem.
- Oferta bez przypisanego wydania: `K` odsyła do Kolejki (tylko dowód ISBN), nie tworzy sztuki.
**Zależności:** brak. **W / T / R:** wysoka / niska / niskie. **Tani eksperyment:** zmierzyć z logu `seen_at` i `deal_alerts`, ile okazji tygodniowo wymaga decyzji i ile kliknięć na okazję; jeśli < 10 okazji dziennie, tryb jest zbędny.

## 2. Kontrola wiarygodności wyceny na własnej historii (backtest)

**Problem.** Każda okazja to „cena vs wycena”, a nikt nie sprawdził, czy wycena trafia w to, za ile oferty faktycznie znikają (hipoteza: znikające oferty to głównie sprzedaże; założenie z indeksu rynku, kwestionowane niżej). Zła wycena = fałszywe okazje albo przeoczone.
**Widok.** W Rynku (indeks) sekcja „Trafność wycen”: dla ofert, które zniknęły w ostatnich 90 dniach, porównanie ostatniej ceny oferty z wyceną wydania sprzed zniknięcia; mediana błędu, odsetek w pasie ±20%, podział na przedziały cenowe i wydawców. Na liście okazji plakietka „wycena: wysoka / średnia / niska pewność” zależna od liczby próbek i dotychczasowego błędu dla tej grupy. Filtr „tylko wysoka pewność”.
**Dane i pliki.** Tylko odczyt: `offer_price_history`, `offers.availability`/`last_seen_at`, `market-valuation.mjs`. Nowy `valuation-backtest.mjs` (czysta funkcja; wycena liczona na danych sprzed daty zniknięcia, bez przecieku z przyszłości). Bez migracji.
**Kryteria.**
- Na zbiorze syntetycznym o znanym błędzie wynik odtwarza ten błąd; oferta zniknięta tego samego dnia, którego dotyczy wycena, nie wlicza własnej ceny do wyceny.
- Poniżej 30 prób w grupie: „za mało danych”, bez liczby i bez plakietki.
- Plakietka nie zmienia rankingu ani listy, tylko ją opisuje (test na tych samych danych).
- Zero żądań sieciowych, tylko odczyt.
**Zależności:** brak (wartość rośnie po 5). **W / T / R:** wysoka / średnia / niskie. **Tani eksperyment:** jednorazowy skrypt na kopii bazy: dla 500 ostatnio zniknętych ofert policzyć stosunek ostatniej ceny do wyceny; jeśli mediana poza 0,8-1,2, wyceny są systematycznie przekrzywione i to jest najważniejszy wynik mapy.

## 3. Kolekcje: luki i najtańsze brakujące tomy w ofertach (**wymaga decyzji właściciela**)

**Problem.** Właściciel ułożył etykiety z kolejnością i numerami tomów, ale ekran etykiety nie mówi nic o rynku: które tomy są teraz do kupienia, za ile, a których nie ma wcale.
**Kierunek produktu.** `PRODUCT-DIRECTION.md` odrzuca „listy brakujących tomów dla kolekcjonera” i „kompletność kolekcji”, ale ten sam plik robi wyjątek dla etykiet na prośbę właściciela. Dlatego: wersja przeformułowana pod handel (oferty i szansa sprzedaży tomów w etykiecie, bez „procentu kompletności”, odznak i rankingów) jest w duchu wyjątku; wersja „co mi brakuje do kompletu” to osobna decyzja. **Decyzja właściciela:** czy etykieta ma „widok rynku” i czy wolno wprost liczyć luki w numeracji tomów.
**Widok.** W etykiecie przełącznik „Rynek”: dla każdej książki: najtańsza żywa oferta z wyceną i oszczędnością, szansa 30 dni, liczba ofert; wiersz „brak ofert” dla tomu bez żywej oferty; wiersz „luka w numeracji: brak tomu 4” (tylko gdy numery 3 i 5 są nadane ręcznie). Dwa przyciski: „Szukaj brakujących” (patrz niżej) i „Kup tańsze zestawy” (paczki sprzedawców dla tej etykiety).
**Skan pod brakujący tom.** Tytuły tomów bez żywej oferty trafiają do skanu przez to samo pole „Szukaj po etykiecie” (zbudowane, wpis 184), więc żadnego nowego kanału; opcjonalnie snajper dodaje je do swojej listy, jeśli etykieta ma włączone „Obserwuj”. Fraza tytułowa tylko wypełnia wyszukiwanie; oferta przypisuje się do tomu wyłącznie na dowodzie ISBN (reguła niezmieniona), więc oferty bez ISBN lądują w Kolejce jak dziś.
**Dane i pliki.** Bez migracji w wersji 1 (odczyt: `work_labels`, `offers`, indeks rynku). Wersja z „Obserwuj”: kolumna `watch` w tabeli etykiet (migracja 146, nowa, nie zmieniamy istniejących). `label-market.mjs` (czysta funkcja `labelMarket(rows)`), trasa `GET /api/labels/:id/market`, rozszerzenie widoku etykiet.
**Kryteria.**
- Etykieta z 5 książkami i znanym zestawem ofert daje dokładnie oczekiwany wiersz na książkę; książka bez przypisanego wydania nie dostaje oferty „z podobnego tytułu”.
- Luka pojawia się wyłącznie przy ręcznie nadanych numerach (nigdy z zgadywania); etykieta bez numerów nie ma wierszy luk.
- Zakres skanu = tytuły tomów bez żywej oferty, limit 200 fraz jak dziś; żadnych żądań poza istniejącym skanem i bramką (test z wstrzykniętym `search`).
- Etykieta bez książek lub tylko z nieznanymi wydaniami: komunikat, nie błąd.
**Zależności:** 1 (przycisk `L`) ułatwia wypełnianie etykiet. **W / T / R:** średnia / średnia / średnie (kierunek produktu). **Tani eksperyment:** SQL na kopii: dla 3 największych etykiet policzyć, ile tomów ma dziś żywą ofertę z wyceną; jeśli < 30%, widok byłby pustą tabelą i funkcja odpada.

## 4. Cel „Kupuję do” dla etykiety i szybkie dodanie do etykiety (zakup do kolekcji)

**Problem.** `price_targets` działa na wydaniu lub dziele; właściciel kupujący serię chce jednej liczby dla całej etykiety („każdy tom do 12 zł”) i jednego ruchu „kupiłem to do tej etykiety”.
**Widok.** (a) W etykiecie pole „Kupuję do … zł (każdy tom)”; okazje poniżej tej ceny dla książek z etykiety dostają znacznik „cel etykiety” i wchodzą do Okazji niezależnie od wyceny, tak samo jak dziś cel dzieła. (b) W liście okazji, Przeglądzie i Łowcy skrót „do etykiety…”: wybór istniejącej etykiety (ostatnio użyta pierwsza), dodanie książki z kolejnym numerem tomu. (c) „Kupiłem do etykiety” = sztuka w Zapasie plus przypisanie do etykiety jednym ruchem.
**Dane i pliki.** Migracja 146 lub 147: `label_price_targets` (`normalized_label`, `max_price` w groszach, `active`, unikalność po etykiecie, kaskada przy usunięciu etykiety). Rozszerzenie `price-targets.mjs` o trzeci zakres; konflikt: gdy wydanie ma cel i etykieta ma cel, wygrywa niższy zakres (wydanie), bo ręcznie określony; reguła opisana w kodzie. `label-collections.mjs` dostaje funkcję dodaj-do-etykiety (już jest dodawanie z wyszukiwarki katalogu, trzeba wystawić je dla `edition_id`).
**Kryteria.**
- Cel etykiety obejmuje tylko książki z jej `work_labels`; usunięcie książki z etykiety zdejmuje cel dla niej w następnym odświeżeniu.
- Cena celu w groszach, `>= 10 000 zł` odrzucona; edycja ceny zachowuje `active` (błąd z wpisu 170 nie wraca).
- Ten sam tom w dwóch etykietach: obowiązuje niższy z celów; test na danych syntetycznych.
- Brak kwot zysku; tylko liczba wskazana przez właściciela.
**Zależności:** 1 (menu `L`). **W / T / R:** średnia / niska / niskie. **Tani eksperyment:** przez tydzień ręcznie ustawiać cele dzieła zamiast etykiety i policzyć, ile razy brakowało „celu zbiorczego”; jeśli rzadko, funkcja (a) odpada, a (b)-(c) wchodzą bez migracji.

## 5. Skąd biorą się dobre zakupy: przypisanie sztuk do frazy i sprzedawcy

**Problem.** Zapas wie, co sprzedało się szybko, ale nie wie, jakim zapytaniem i od kogo to kupiono, więc nie ma sprzężenia zwrotnego do skanu (frazy, snajper, paczki). Aplikacja liczy „szumiące frazy”, ale nie „frazy, które dały sprzedane sztuki”.
**Widok.** W Zapasie i raporcie tygodniowym tabela „Co przyniosło towar”: fraza lub sprzedawca -> sztuki kupione / sprzedane w 30 dni / mediana dni do sprzedaży. W Frazach obok szumu kolumna „dała sztuki”. Podpowiedź (tylko tekst) „fraza X: 0 zakupów przy 140 okazjach, rozważ zawężenie”. Żadnych automatycznych zmian fraz bez zatwierdzenia (reguła odwracalności).
**Dane i pliki.** Migracja 147: w `stock_items` kolumny `source_seller_id`, `source_phrase` (zrzut w momencie „Kupiłem”, bo `offer_id` może zniknąć przez SET NULL; nowe kolumny, nie zmieniamy migracji 142). `stock-attribution.mjs` (czysta funkcja), rozszerzenie raportu tygodniowego i widoku Fraz. Dane wypełniane wstecz tylko z `offers.matched_queries_json` dla sztuk, które mają jeszcze `offer_id`.
**Kryteria.**
- Sztuka z `offer_id = NULL` nadal ma frazę i sprzedawcę z zrzutu; stara sztuka bez zrzutu: „nieznane źródło”, nie zgadywanie.
- Frazy z < 10 okazjami lub < 5 sztukami: „za mało danych”, bez procentu.
- Oferta znaleziona przez kilka fraz: dzielona po równo albo przypisana pierwszej (reguła opisana i przetestowana, nie ukryta).
- Brak kwot; tylko liczby sztuk i dni.
**Zależności:** twardo od Zapasu (jest), wartość po kilku tygodniach używania. **W / T / R:** średnia / średnia / niskie. **Tani eksperyment:** ręcznie, w arkuszu, dla pierwszych 10-15 sztuk z Zapasu dopisać frazę i sprzedawcę i zobaczyć, czy cokolwiek się powtarza; jeśli każda sztuka pochodzi z innego miejsca, atrybucja nic nie powie.

## 6. Obserwowany sprzedawca (nowe oferty tych, od których opłaca się kupować)

**Problem.** Paczki i karta sprzedawcy pokazują stan na dziś; właściciel nie dowie się, że sprzedawca, od którego kupił 3 tanie książki, wystawił kolejne 5, chyba że fraza przypadkiem je złapie.
**Widok.** Przycisk „Obserwuj” na karcie sprzedawcy i w paczce. Obserwowani w Okazjach jako filtr „od obserwowanych”; nowa oferta obserwowanego (z danych już skanowanych) wchodzi do skrzynki z oznaczeniem „obserwowany”, nawet jeśli cena jest tylko lekko poniżej wyceny. Nie dodaje nowych żądań: korzysta z tego, co skan i snajper już pobierają. Własne żądanie do strony sprzedawcy to osobna decyzja i osobna zgoda na koszt bramki (nie w wersji 1).
**Dane i pliki.** Migracja 148: `watched_sellers` (`source`, `seller_id`, `created_at`, `note`). `watched-sellers.mjs`, filtr w `deals.mjs`, przycisk na karcie z wpisu 179. Pusty `seller_id` nie może być obserwowany.
**Kryteria.**
- Obserwacja nie wpływa na ranking, tylko dodaje oznaczenie i filtr (test na tych samych danych).
- Sprzedawca bez `seller_id` (źródło go nie podaje) nie ma przycisku; zmiana nazwy sprzedawcy nie gubi obserwacji (klucz to `seller_id`).
- Usunięcie obserwacji nie usuwa ofert ani historii.
- Zero żądań sieciowych w wersji 1 (test z `fetcher`, który rzuca).
**Zależności:** brak; lepsza po 2 (żeby „obserwowany” nie znaczył „tani i zły”). **W / T / R:** średnia / niska / niskie. **Tani eksperyment:** SQL na kopii: dla sprzedawców z >= 3 okazjami w 90 dniach policzyć, ilu wystawiło kolejną okazję w następnych 30 dniach; jeśli mniej niż co czwarty, obserwowanie nie ma sensu.

---

## Uproszczenia (małe, bez nowych funkcji)

- **Jedna wspólna kolumna akcji oferty** (kupiłem / do etykiety / odłóż / nie / wystaw) w Okazjach, Przeglądzie i Łowcy; dziś te przyciski są prawdopodobnie kopiowane w trzech widokach (hipoteza: sprawdzić `deals.js` i `hunter.js`). Cel: mniej kodu i jedno miejsce testów.
- **Raport tygodniowy: sekcja „świeżość kopii”** (wpis 176 sam mówi, że jej brak); tania, bez migracji.
- **`CLAUDE.md`**: pole „last: 141” rozmija się z migracją 145 (stan na dziś); poprawić w tym samym commicie co kolejną migrację.
- Okazje to ciągle jeden ekran z wieloma sekcjami; po 1 część paneli (cele, paczki) może zniknąć za zwijanymi nagłówkami, jeśli log zdarzeń pokaże, że nikt ich nie otwiera.

## Kolejność wdrożenia

1. **1. Przegląd okazji** (bez migracji; największa oszczędność pracy ręcznej, odblokowuje menu etykiety).
2. **2. Backtest wycen** (bez migracji; sprawdza fundament wszystkich decyzji; wynik może zmienić priorytety 3-6).
3. **3. Kolekcje: widok rynku etykiety** (wersja 1 bez migracji; po decyzji właściciela).
4. **4. Cel etykiety i dodanie do etykiety** (część b-c bez migracji, część a po eksperymencie).
5. **5. Atrybucja frazy i sprzedawcy** (migracja; wartość dopiero po kilku tygodniach danych Zapasu, więc zacząć zbierać zrzut jak najwcześniej: można wdrożyć samą migrację i zapis zrzutu wcześniej niż widok).
6. **6. Obserwowany sprzedawca** (po pomiarze).

## Trzy najlepsze

1. **Backtest wycen (2):** jedyny pomysł, który sprawdza, czy aplikacja mówi prawdę; tani, bez migracji i bez sieci.
2. **Przegląd okazji (1):** najkrótsza droga do „mniej pracy ręcznej” i do uczynienia Zapasu i etykiet użytecznymi w ruchu.
3. **Rynek etykiety (3):** łączy kolekcje z handlem; po decyzji właściciela da mu to, o co prosił (etykiety), w postaci, która jest w duchu produktu.

## Założenia, które kwestionuję

- **„Zniknięcie oferty = sprzedaż”** (indeks rynku, szansa 30 dni): oferta znika też przez usunięcie, zmianę zdania, sprzedaż poza Vinted; backtest (2) i kalibracja z Zapasu (181) powinny to rozstrzygnąć, a plakietka pewności pokazać skutki.
- **„Okazja = oferta poniżej wyceny”:** bez znajomości stanu książki i kosztu wysyłki to nadal tylko filtr, nie decyzja; nie proponuję tu kwot (bez zgody), ale stan zapasu bez cen nie powie, czy zakupy się opłacały; to granica, którą właściciel może później sam przesunąć.
- **„Brakujące tomy to funkcja kolekcjonerska i trzeba ją odrzucić z zasady”:** dla kogoś, kto kupuje serie do odsprzedaży, kompletne serie bywają droższe niż suma pojedynczych tomów; to hipoteza do sprawdzenia danymi z indeksu (ceny zestawów vs pojedynczych), nie dogmat.
- **„Więcej zakładek = więcej wartości”:** ostatnie 14 wpisów to nowe widoki; wartość dziś leży w zamknięciu pętli i skracaniu kliknięć, nie w kolejnych ekranach.
- **„Nie klikane w żywym UI”** (powtarza się w wpisach 172-184): ogromna część funkcji nie była oglądana w przeglądarce ani na telefonie; ryzyko regresji wizualnych jest większe niż ryzyko brakującej funkcji. Proponuję przed pozycją 3 jeden cykl wyłącznie na `browser-smoke` i `css-snapshot --only` dla nowych widoków (Zapas, Szukaj, Etykiety, Łowca).
- **Ustalenie z `CLAUDE.md` „Niche vs broad open — measure”:** nadal nikt tego nie rozstrzygnął; backtest (2) i atrybucja (5) dadzą pierwsze twarde liczby do tego sporu.

## Kogo zapytać

- **Właściciel:** czy etykieta ma „widok rynku” i liczyć luki numeracji (pozycja 3); czy cel etykiety ma być osobnym zakresem (pozycja 4).
- **Backend/QA:** ocena zrzutu `source_phrase` i reguły podziału oferty znalezionej kilkoma frazami (5); testy backtestu bez przecieku danych z przyszłości (2).
- **UX/frontend:** koszt trybu Przeglądu na telefonie przez Tailscale (klawisze nie działają na dotyku, potrzebne przyciski i gest) i wspólnej kolumny akcji.
- **Data/analityk:** czy `offer_price_history` ma dość gęstą historię przed zniknięciem oferty, by backtest miał sens.
