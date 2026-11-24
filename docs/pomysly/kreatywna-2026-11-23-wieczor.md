# Kreatywna sesja 2026-11-23 (wieczór): wielkie ruchy po stronie kupna

Zakres: znajdowanie, sprawdzanie i wycena książek do odsprzedaży na Vinted. Zero wejścia od właściciela jako warunek. Fakty pochodzą z `CLAUDE.md`, `CHANGELOG.md` (wpisy 250-255), `docs/pomysly/2026-11-23-pomiary.md` i `docs/SCHEMA.sql`. Reszta to hipotezy; każda ma eksperyment z kryterium go/no-go. Eksperymenty tylko na `data/bookflip-catalog.sqlite` (odczyt, bez sieci), chyba że napisano inaczej.

## Kluczowa obserwacja

Wąskim gardłem nie jest wycena ani rozpoznawanie, tylko **zasięg**: strumień widzi ok. 14% nowych ogłoszeń (3 strony na 20 min), a z nich 0,5% pasuje do 486 fraz katalogu. Z pomiarów: oferty poza niszą mają podobną jakość (6,3% okazji wobec 7,4%) i 2,3 razy większą liczbę. Czyli „nisza" jest artefaktem listy fraz, a nie przewagą rynkową. Dodatkowo 97% nieprzypisanych ofert Vinted ma ISBN, a Łowca już wycenia 94% ISBN spoza katalogu z samych ofert. Mamy więc wycenę całego rynku, a skaner szuka przez wąskie okienko 486 tytułów.

## Pomysły (ranking od najlepszego)

### 1. Strumień po indeksie wycenionych ISBN, nie po 486 frazach (TOP)

- **Teza:** dopasowywać świeże ogłoszenia ze strumienia do tytułów wszystkich ISBN, które potrafimy wycenić (ok. 2115 w paczce Łowcy, w tym spoza katalogu), a nie tylko do fraz dzieł; wybrane ogłoszenia dostają stronę szczegółów (ISBN), wycenę i ewentualną okazję „poza katalogiem".
- **Co się zmienia dla właściciela:** w Okazjach i w powiadomieniach pojawia się ok. 4-5 razy więcej trafień dziennie bez dodawania czegokolwiek ręcznie. Karta oznaczona „spoza katalogu" (jak w Łowcy), bez przypisania, bez nowej pracy w kolejce.
- **Dane:** `offers` (`original_title`, `observed_isbn`, `listed_at`, `seller_id`), `offer_editions` (ISBN a wydanie), `editions`, `vinted_detail_cache` (ISBN ze strony ogłoszenia), `removed_works` (domyślnie wykluczone, patrz ryzyka). Wycena jak w `hunter-pack.mjs`.
- **Eksperyment (offline):** zbuduj indeks tytułów z ofert, które mają ISBN i wycenę średnią lub wysoką. Dla losowych 2000 ofert Vinted z bazy udawaj, że znasz tylko tytuł, i sprawdź (a) jaki odsetek ma tytuł pasujący do indeksu, (b) w ilu dopasowanie wskazuje właściwy ISBN lub zbiór wydań dzieła. Do tego policz, ile z dopasowanych jest okazją wg tej samej wyceny. Wzorzec: tak mierzono filtr tytułów w wpisie 254 (82% / 94%).
- **Go:** pokrycie ≥ 5% ofert (10 razy więcej niż 0,5%), precyzja wskazania właściwego dzieła ≥ 85%, a koszt: dopasowane ogłoszenia ≤ 15 stron szczegółów na przebieg (bramka). **No-go:** pokrycie < 2% lub precyzja < 70%.
- **Ryzyka:** tytuł tylko wybiera, co pobrać; dowodem zostaje ISBN ze strony ogłoszenia (zasada zachowana). Więcej żądań szczegółów: tylko przez `marketplace-gate.mjs`, ze stałym limitem na przebieg. Wydania tego samego dzieła mają różne ceny (pomiar), więc wycena zawsze po ISBN, nigdy po dziele. **Wymaga decyzji właściciela:** czy ISBN dzieł usuniętych przez niego (791) mają wracać jako okazje. Domyślnie nie; to jego świadoma decyzja. Tym bardziej warto zapytać, dlaczego je usuwał (szum czy brak zainteresowania gatunkiem).
- **Rozbudowa:** pierwsza wersja bez migracji (indeks w pamięci jak pakiet Łowcy). Czas: 1-2 dni.

### 2. „Zegar rynku": najpierw zmierz, jak szybko znikają okazje, potem śledź strumień co minutę

- **Teza:** jeśli okazje znikają w minutach, 20-minutowy rytm jest przegrany z góry; jedna strona strumienia (ok. 95 ogłoszeń = ok. 1 min) co 60-90 s daje pokrycie bliskie 100% za cenę ok. 40-60 żądań na godzinę.
- **Co się zmienia:** powiadomienie przychodzi w 1-2 minuty od wystawienia, nie w 20; okazje, które dziś zdążyłby kupić ktoś inny, są dostępne.
- **Dane:** `offers.listed_at`, `offer_status_history` (status `sold`/`reserved`, `observed_at`), `offer_price_history`, `deal_alerts`.
- **Eksperyment (offline):** dla ofert Vinted, które potem zniknęły albo były sprzedane, a których cena była ≤ 70% wyceny swojego ISBN, policz rozkład czasu od `listed_at` do pierwszego statusu `sold`/`reserved`/`unavailable`. Ograniczenie: czas wykrycia jest zaszumiony częstotliwością sprawdzania (`availability_checked_at`), więc to górna granica.
- **Go:** ≥ 30% okazji znika w ciągu 30 min od wystawienia (wtedy rytm 20 min traci co trzecią okazję). **No-go:** mediana > 6 h; wtedy obecny rytm wystarczy i oszczędzamy żądania.
- **Ryzyka:** częstsze żądania do Vinted. Limit i tempo wyznacza bramka; trzeba zapytać autora bramki (marketplace-gate), czy 1 żądanie na minutę jest w jej budżecie. Nie omijamy żadnej blokady; przy 403/429 przerwa jak dotąd. Wymaga decyzji właściciela przy zmianie rytmu skanowania (zwiększa ruch).

### 3. Aktywne uczenie wyceny: sprawdzaj status ofert tam, gdzie brakuje dowodów sprzedaży

- **Teza:** wycena z ≥ 8 obserwacjami jest dwa razy trafniejsza (błąd 0,163 wobec 0,34-0,38), więc zamiast sprawdzać status ofert po kolei, kolejkować sprawdzenia tam, gdzie jedna lub dwie dodatkowe potwierdzone sprzedaże zmieniłyby werdykt okazji (jak giełda: wartość informacji).
- **Co się zmienia:** więcej okazji o wysokiej wiarygodności, mniej „do sprawdzenia"; zero pracy właściciela.
- **Dane:** `offers.availability_checked_at`, `offer_status_history`, `offers.current_price`, wyceny wydań z liczbą obserwacji.
- **Eksperyment (offline):** policz aktywne oferty-okazje (próg jak w Okazjach) na wydaniach z 3-7 obserwacjami, których wycena po dodaniu 1-3 sprzedaży o tej samej medianie przeszłaby w „wysoką". Policz też, ile ofert (sprzedanych lub wygasłych, niesprawdzonych) leży na tych wydaniach.
- **Go:** ≥ 30 okazji aktywnych na takich wydaniach i ≥ 100 ofert do sprawdzenia, tzn. dużo zysku z małego kosztu. **No-go:** < 10 okazji.
- **Ryzyka:** dodatkowe żądania statusu przez bramkę (istniejący mechanizm sprawdzania dostępności, nowa tylko kolejność). Pomiar nie ruszał liczby sprzedaży jako takiej; to tylko szybsze zebranie danych, które i tak powstaną.

### 4. Koszyk u jednego sprzedawcy

- **Teza:** okazje u tego samego sprzedawcy łączą się w jedną paczkę (jedna wysyłka, często rabat za kilka sztuk), więc sprzedawca z 3 okazjami jest wart więcej niż suma okazji.
- **Co się zmienia:** w Okazjach wiersz „Sprzedawca X: 4 okazje, razem ok. N zł oszczędności"; ranking uwzględnia grupę. Bez kosztów i zysku, tylko grupowanie istniejących okazji.
- **Dane:** `offers.seller_id`, `seller_name`, `seller_business`, `shipping_cost`, `buyer_fee`, `watched_sellers`; okazje z `deals.mjs`.
- **Eksperyment (offline):** policz okazje aktywne według sprzedawcy: ile sprzedawców ma ≥ 2 okazje i jaki udział oszczędności leży w takich grupach. Dodatkowo: ilu sprzedawców ma ≥ 5 ofert wycenionych poniżej wyceny (czyści biblioteki).
- **Go:** ≥ 25% oszczędności w grupach ≥ 2. **No-go:** < 10%.
- **Ryzyka:** znikome, tylko nowy widok i sortowanie; nie rozszerza zapytań. Rabaty Vinted za zakupy zbiorcze są hipotezą (do sprawdzenia przez właściciela raz przy zakupie, nie w kodzie).

### 5. Okno negocjacji: które ogłoszenia dadzą się stargować

- **Teza:** ogłoszenie leżące długo, z małą liczbą polubień i z historią obniżek tego sprzedawcy, ma wysokie prawdopodobieństwo przyjęcia niższej propozycji; można pokazać „proponuj X zł" tam, gdzie cena jest tuż nad progiem okazji.
- **Co się zmienia:** nowa klasa okazji „prawie": cena powyżej progu, ale z dużym prawdopodobieństwem obniżki. Karta podpowiada kwotę propozycji.
- **Dane:** `offer_price_history`, `offers.listed_at`, `favourite_count`, `view_count`, `offer_relists`, `seller_id`.
- **Eksperyment (offline):** z historii cen policz, jaki odsetek ofert obniżył cenę w ciągu 14 dni od dnia X po wystawieniu, w podziale na wiek, liczbę polubień, sprzedawcę, który już obniżał ceny. Model prosty (tabela), nie ML.
- **Go:** przy wybranej regule (np. wiek > 14 dni, ≤ 2 polubienia) ≥ 35% ofert obniża cenę o ≥ 10% w 14 dni. **No-go:** < 15%.
- **Ryzyka:** to nie jest okazja z faktów, tylko prognoza; oznaczać jako hipotezę. Propozycje cenowe składa właściciel ręcznie; aplikacja nic nie wysyła do Vinted.

### 6. Szukanie po ISBN zamiast po frazach dzieł (hipoteza, wymaga sprawdzenia na żywo)

- **Teza:** dla ISBN o najlepszym obrocie (z indeksu „Rynek") zapytania o sam numer ISBN są precyzyjniejsze niż frazy tytułów i omijają szum, a lista „gorących ISBN" rośnie sama z danych o sprzedażach.
- **Co się zmienia:** snajper dostaje drugi tor: top ISBN rotowane w partii obok fraz.
- **Dane:** indeks „Rynek" (`market-index.mjs`), `offers.observed_isbn`, `offer_status_history`.
- **Eksperyment (offline, potem jedno zapytanie przez bramkę):** policz, ile ofert w bazie ma ISBN w opisie (`offer_descriptions`), bo wyszukiwarka Vinted nie musi indeksować opisu. Jeśli ≥ 40% ofert ma ISBN w opisie, zrób jedno zapytanie testowe ISBN przez zwykły skan i zobacz, czy zwraca oferty z tym ISBN.
- **Go:** zapytanie ISBN zwraca ≥ 70% ofert zawierających ten ISBN względem zapytania tytułowego. **No-go:** wyszukiwarka ignoruje opis.
- **Ryzyka:** nieznane zachowanie wyszukiwarki; kosztuje żądania bramki (rotacja ISBN pod ten sam limit).

### 7. Wspólna miara „czas do decyzji" (pomysł pomocniczy)

- **Teza:** mierzyć od wystawienia do powiadomienia i do kliknięcia „Biorę", żeby widzieć, co naprawdę opóźnia zakup (pomiar z 22.11: alert oglądany po ok. 1,2 h).
- **Eksperyment:** dodać metrykę do `metric_snapshots` (czas wystawienia → wykrycia → powiadomienia); bez wejścia właściciela. Go: jeśli wykrycie > 20 min w ≥ 50% przypadków, pomysł 2 ma sens.
- **Ryzyka:** minimalne; mała zmiana.

## Ranking i wybór

| Miejsce | Pomysł                       | Wartość     | Trudność    | Ryzyko                    |
| ------- | ---------------------------- | ----------- | ----------- | ------------------------- |
| 1       | Strumień po indeksie ISBN    | bardzo duża | średnia     | średnie (żądania, decyzja o usuniętych) |
| 2       | Zegar rynku (pomiar, potem rytm) | duża    | mała/średnia | średnie (bramka)         |
| 3       | Aktywne uczenie wyceny       | duża        | średnia     | małe                      |
| 4       | Koszyk u sprzedawcy          | średnia     | mała        | małe                      |
| 5       | Okno negocjacji              | średnia     | średnia     | średnie (prognoza)        |
| 6       | Szukanie po ISBN             | niepewna    | mała        | niepewne                  |
| 7       | Czas do decyzji              | pomocnicza  | mała        | małe                      |

**Do zbudowania jako następne: nr 1.** Powód: bierze to, co już jest zmierzone (wycena po ISBN działa na 94% książek spoza katalogu, oferty poza niszą mają podobną jakość), a usuwa zmierzone wąskie gardło (0,5% pasowania). Wymaga zero wejścia od właściciela. Pierwszy krok: eksperyment offline (kilka godzin). Równolegle taniutki pomiar z nr 2 i 7 (to ten sam odczyt bazy), bo rozstrzyga, czy rytm 20 min w ogóle ma sens.

## Założenia, które kwestionuję

1. „Nisza to przewaga": dane mówią o czymś innym. Na ofertę nisza jest tylko nieco lepsza (7,4% wobec 6,3%), a szeroki rynek ma 2,3 razy więcej ofert i 1,9 razy większą kwotę oszczędności. Nisza jest efektem listy fraz.
2. „Katalog trzeba utrzymywać ręcznie, żeby coś wycenić": wycena po ISBN z ofert działa bez przypisania (94%). Katalog służy porządkowi i frazom, nie jest warunkiem okazji. Rośnie więc sam z tego, co się szybko sprzedaje, jeśli właściciel pozwoli (wymaga decyzji właściciela, bo 791 usunięć było jego decyzją).
3. „Rytm 20 min jest dobry": nie mamy pomiaru czasu życia okazji; dopóki go nie ma, to założenie.
4. „Funkcje wymagające wejścia właściciela się opłacają": 0 celów „Kupuję do", 0 werdyktów, 0 zapasu. Wejście ręczne jest w praktyce martwe; priorytet dla funkcji bez wejścia.
5. „Zestawy, tytuły, łączenie wydań, stan": odrzucone słusznie, ale wynika z tego, że ceny trzeba trzymać na poziomie ISBN. Pomysł 1 respektuje to.

## Do kogo z pytaniem

- Strażnik bramki (marketplace-gate): budżet żądań dla pomysłów 1 i 2.
- Właściciel (przez koordynatora): czy okazje spoza katalogu i spoza usuniętych dzieł mają być pokazywane, i dlaczego usunął 791 dzieł.
- Specjalista od wyceny: czy ISBN z wyceną „średnią" wystarcza do alertu push, czy tylko „wysoka".

## Wyniki sprawdzenia na kopii bazy (koordynator, 2026-11-23 wieczorem)

- **#1 strumień po wszystkich wycenionych ISBN — no-go.** Z 2122 wycenionych ISBN 971 to wydania dzieł usuniętych przez właściciela (tych nie ruszam: to jego decyzja), 828 to żywy katalog (już w strumieniu przez frazy dzieł), a spoza katalogu jest 323, z czego tylko 11 ma pewną wycenę; ich tytuły to tytuły sprzedawców („Każdy Salvatore Scibona książka”). Zysk pomijalny bez cofania usunięć.
- **#2 zegar rynku — za mało danych.** `dealLifetime` na 60 dni: 36 okazji, 16 bez czasu wystawienia, 19 nadal żywych, 1 zniknęła. Wrócić po kilku tygodniach snajpera.
- **#4 koszyk u jednego sprzedawcy — no-go.** 225 okazji, 157 ze znanym sprzedawcą, 10 sprzedawców z ≥ 2 okazjami (głównie po 2), w grupach 12% oszczędności (próg go 25%).
- **#3 aktywne uczenie wyceny — zbudowane w wersji „tylko kolejność”.** 216 widocznych okazji bez wysokiej wiarygodności na 148 wydaniach; w kolejce sprawdzeń statusu 959 ofert „do sprawdzenia, zniknęły ze skanów” i 1259 nigdy nie sprawdzonych, z czego 47 i 194 na tych wydaniach. Sprawdzenia (20 na rundę) idą teraz najpierw do nich; budżet żądań bez zmian. Kolejka i tak schodzi w ok. dobę (1–5 tys. sprawdzeń dziennie), więc zysk to godziny, nie dni.
- **#5, #6, #7** — nie sprawdzane w tej sesji.
- **#6 szukanie po ISBN — sprawdzone na żywo (16 zapytań przez bramkę).** Wyszukiwarka Vinted znajduje ogłoszenie po ISBN z opisu/pola ISBN: 3 z 4 znanych ogłoszeń z ISBN tylko w opisie znalazły się po samym ISBN (czwarte to zestaw „15 x fantastyka”, mogło być już sprzedane). Dla 6 najcenniejszych wydań: wyszukanie po ISBN dało 1, 7, 8, 2, 7, 1 wyników; ogłoszeń, których nie zwróciła fraza dzieła, było 1 w 3 z 6 wydań: „Diablo. Wojna grzechów” (literówka w tytule), „World of Warcraft kronika tom 2” (fraza „kronika Metzen” jest słaba: pierwszy z 12 autorów) i jedno fałszywe („The kissing booth 2”). Wniosek: realny, ale umiarkowany zysk (ok. 0,5 ogłoszenia na wydanie); dwie tańsze rzeczy wyszły przy okazji: (a) fraza snajpera dla dzieł wieloautorskich bywa zła (pierwszy autor z długiej listy), (b) ISBN jako dodatkowa fraza ma sens tylko dla najcenniejszych wydań. Kandydat na następny cykl: zapytania po ISBN dla kilkunastu wydań o najwyższym „bierz do” w rotacji snajpera (1 slot), z pomiarem nowych ofert na żądanie.
