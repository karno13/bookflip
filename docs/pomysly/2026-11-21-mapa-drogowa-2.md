# Mapa drogowa 2 (2026-11-21): nawigacja i sześć funkcji

Poprzednia: `2026-11-21-mapa-drogowa.md` (w pełni zbudowana). Fakty: odczyt `app/index.html`, `app/app.js` (`showView`), `app/core/view-history.js`, `app/views/queue.js`, `docs/SCHEMA.sql`, `scan-schedule.mjs`, `docs/PRODUCT-DIRECTION.md`. Reszta to hipotezy. Zasady wspólne: etykiety zakładek zostają, żadnych żądań poza `marketplace-gate.mjs`, testy na `:memory:` bez sieci, migracja tylko tam, gdzie wskazano (kolejny wolny numer po 141; sprawdzić w `migrations/`, bo `CLAUDE.md` ciągle podaje 139).

---

## A. Uproszczenie nawigacji

### Stan (fakt)
Pasek boczny ma 9 pozycji (Dziś, Kolejka, Książki, Oferty, Okazje, Łowca, Frazy, Źródła, Ustawienia), dolny pasek telefonu 8 (Dziś, Kolejka, Książki, Oferty, Okazje, Łowca, Frazy, Ustawienia; bez Źródeł). 8 przycisków na wąskim ekranie to już raz powodowało łamanie wiersza (commit 897b330). Widok „Okazje” zawiera już Rynek (indeks), snajpera, cele i paczki jako sekcje jednego długiego ekranu. „Kolejka” jest już grupą: jedna pozycja, a pod nią `QUEUE_TYPES` (Weryfikacja, Zestawy, Podejrzane, Duplikaty), widoki `review/sets/checks`. Mechanizm grupy z podwidokami więc istnieje i działa; trzeba go uogólnić, nie wynajdować.

### Proponowany podział (po zadaniu)
| Grupa (etykieta) | Podwidoki (etykiety bez zmian) | Zadanie |
|---|---|---|
| Dziś | (plan dnia, raport tygodniowy, kopia) | „co robię teraz” |
| Rynek | Okazje, Paczki, Cele („Kupuję do”), Rynek (indeks), Snajper | „co kupić” |
| Łowca | (sesja; później Zapas, patrz B1) | „w terenie” |
| Kolejka | Weryfikacja, Zestawy, Podejrzane, Duplikaty (bez zmian) | „co dopiąć” |
| Książki | Książki, Oferty | „baza” |
| Skan | Źródła, Frazy | „skąd i czym szukam” |
| Ustawienia | bez zmian | |

Pasek boczny: 7 pozycji zamiast 9. Telefon (dolny pasek, 5 miejsc): Dziś, Rynek, Łowca, Kolejka, „Więcej”. „Więcej” otwiera listę: Książki, Skan, Ustawienia. Uzasadnienie: telefon służy do przeglądu okazji i pracy w terenie; Oferty i Frazy to praca przy komputerze.

Zmiana nazwy „Okazje” jako grupy na „Rynek” kłóci się z istniejącą sekcją „Rynek” (indeks) wewnątrz Okazji. Rozwiązanie: grupa „Rynek”, jej pierwszy podwidok „Okazje” (domyślny), indeks jako podwidok „Rynek” oznaczony hasłem „Indeks”; etykiety obu zostają, tylko poziom wyżej się zmienia. Alternatywa bez ryzyka mylenia: grupa nazwana „Okazje” z podwidokami Okazje/Paczki/Cele/Indeks rynku/Snajper. Do wyboru przez właściciela (kwestia nazwy, nie funkcji).

### Plan migracji (bez utraty funkcji, 4 małe kroki)
1. **Model grup.** `app/core/nav-groups.js` (czysty moduł, test): mapa `grupa -> [widoki]`, `grupaOd(widok)`, `domyślny(grupa)`, zapamiętanie ostatniego podwidoku w `localStorage` (`bookflip.navLast.<grupa>`). `showView` zostaje bez zmian; zmienia się tylko wyliczanie `navName` (dziś `QUEUE_VIEWS.includes(name) ? 'queue' : name`) na `grupaOd(name)`. Kryterium: dla każdego z 11 widoków (`today scanner review checks catalog sets offers deals hunter phrases settings`) test wskazuje dokładnie jedną grupę, a lista widoków w grupach = lista w `showView` (test pilnuje spójności).
2. **Pasek podzakładek.** Jedna wspólna kontrolka (`<nav class="subtabs">` nad treścią, w stylu istniejącego wyboru typu kolejki) pokazuje podwidoki aktywnej grupy. Pod spodem dotychczasowe `<section id="view-…">` bez przenoszenia treści. Adresy `?view=…` działają dalej (kryterium: każdy dotychczasowy adres otwiera ten sam widok i podświetla właściwą grupę; `view-history.js` ma już `FROM_URL` na aliasy).
3. **Rozbicie Okazji.** Dziś jedna sekcja ma deals, snajpera, cele, paczki, indeks. Podział na podwidoki `deals`, `bundles`, `targets`, `market` (sekcje już mają osobne widoki `dealsView/sniperView/targetsView/bundlesView` wywoływane w `showView`; zostaje przenieść wywołania `refresh` do właściwych podwidoków, żeby odwiedzenie Okazji nie ładowało czterech zapytań naraz). Kryterium: wejście w „Okazje” wykonuje tylko żądania okazji (test listy żądań w smoke), a licznik `dealsNavCount` nadal działa.
4. **Dolny pasek.** 5 miejsc + „Więcej”; test w `browser-smoke` na szerokości 360 px: brak łamania wiersza, każdy widok osiągalny w najwyżej 2 dotknięciach. Skrót w palecie poleceń (`app.js` ok. linii 1245) dla każdego podwidoku zostaje, więc nic nie ginie z klawiatury.

Czego nie ruszać: identyfikatorów `data-view` (testy i smoke czytają tekst `app/`; 24 testy czytają źródło), tytułów `data-title`, etykiet. Ryzyko: średnie (24 testy czytające tekst `app/index.html`), więc krok 1-2 najpierw na dodatkowych atrybutach `data-group` bez przebudowy paska, a przełączenie wyglądu dopiero po zielonym `verify` i `browser-smoke`, z `css-snapshot --only` dla nawigacji. Pierwszy eksperyment: zmierzyć, ile razy dziennie właściciel przechodzi między Okazje, Frazy, Łowca (log zdarzeń widoku jest tańszy niż ankieta); jeśli rzadko, grupowanie jest tylko kosmetyką i wystarczy punkt 4 (dolny pasek).

**Wymaga decyzji właściciela:** nazwa grupy (Rynek vs Okazje) oraz to, czy Frazy mają wejść do „Skan”, czy do „Rynek”.

---

## B. Sześć kolejnych funkcji (kolejność wdrożenia)

### 1. Adaptacyjny harmonogram snajpera (godziny napływu)
**Problem.** Snajper skanuje co 15-60 min równo przez całą dobę, a nowe oferty na Vinted napływają falami (wieczory, weekendy; hipoteza). Równy odstęp marnuje budżet bramki w nocy i spóźnia się w szczycie.
**Widok.** W sekcji Snajper (podwidok Rynek) przełącznik „Dopasuj do godzin napływu” i mała tabela 7x24 z intensywnością napływu oraz „następny skan za X min (szczyt)”. Domyślnie wyłączone.
**Dane i pliki.** Bez migracji: histogram z czasu wystawienia ofert (indeks rynku już liczy czas wystawienia z Vinted) lub `offers.first_seen_at` w oknie 28 dni. Nowy `inflow-profile.mjs` (czysta funkcja: `profile(rows) -> 168 wag`), zmiana `nextSniperRunAt` w `scan-schedule.mjs` tak, by odstęp = clamp(bazowy / waga, 15, 60) min. Ustawienie w `scan_schedule`/`saveSniper`. Zmiana nie dotyka bramki ani limitów.
**Kryteria (bez sieci).**
- Na syntetycznych danych (znany szczyt 18-22) odstęp w szczycie = 15 min, w nocy = 60 min; zawsze w granicach 15-60 (test własności).
- Mniej niż 14 dni lub < 200 ofert danych: profil płaski, zachowanie identyczne z dzisiejszym (test równoważności).
- Dobowa liczba skanów adaptacyjnych <= dobowa liczba skanów przy stałym odstępie bazowym (budżet nie rośnie).
- Czas wstrzyknięty; po pauzie źródła po blokadzie odstęp nie skraca się.
**Zależności:** brak. **W / T / R:** średnia / niska / niskie. Eksperyment: skrypt offline na kopii, który wypisuje macierz 7x24; jeśli różnica szczyt/noc < 2x, funkcja odpada.

### 2. Rejestr „kupione -> wystawione -> sprzedane” (sztuki, nie pieniądze)
**Problem.** Pętla kończy się na okazji. Aplikacja nie wie, co właściciel kupił, kiedy wystawił i kiedy sprzedał, więc nie ma jak sprawdzić, czy prognozy (szansa 30 dni) i wyceny się sprawdzają na jego własnym towarze; Łowca i Wystaw nie mają dokąd odesłać wyniku.
**Widok.** Podwidok „Zapas” w grupie Łowca: lista sztuk w trzech kolumnach stanu (Kupione, Wystawione, Sprzedane), przyciski przesuwające stan jednym kliknięciem, wiek sztuki w dniach. Wejścia: „Kupiłem” przy okazji i w sesji Łowcy („Biorę” -> „Kupiłem zaznaczone”), „Wystawiłem” w panelu Wystaw. Nagłówek: mediana dni kupno->wystawienie i wystawienie->sprzedaż oraz „sprzedane w 30 dni: N z M”.
**Zakres a kierunek.** Rejestr samych stanów i dat (bez kwot) mieści się w kierunku produktu: pozycja 4 „Obsługa handlu” i priorytet 3 „statusy transakcyjne”. **Wymaga decyzji właściciela:** (a) czy wolno dodać opcjonalną cenę wystawienia i sprzedaży (to już kwoty; `CLAUDE.md` odkłada „profit, costs, ledger”), (b) czy zostać przy samych datach. Rekomendacja: wersja 1 bez żadnych kwot; pola kwot jako osobna decyzja potem. Koszty i zysk nie wchodzą w żadnym wariancie bez zgody.
**Dane i pliki.** Migracja `stock_items` (`id`, `edition_id` NOT NULL, `offer_id` NULL z ON DELETE SET NULL, `status` bought/listed/sold/dropped, `bought_at`, `listed_at`, `sold_at`, `note`) i `stock_events` (zmiana stanu, odwracalność). `stock.mjs` (czyste przejścia), wpisy w `api-routes.mjs`, `app/views/stock.js`, przyciski w `deals.js`, `hunter.js`, panelu Wystaw. Zasada „decyzja automatyczna odwracalna” spełniona przez dziennik zdarzeń.
**Kryteria.**
- Dozwolone przejścia: bought->listed->sold, dowolny stan->dropped, cofnięcie ostatniego; niedozwolone (sold->bought) kończy się `statusCode: 400`.
- Znikająca oferta źródłowa nie usuwa sztuki (SET NULL).
- Mediany czasów liczone na znanym zbiorze testowym; brak danych daje „-”, nie 0.
- Sztuki bez `edition_id` nie powstają (tylko dowód ISBN): „Kupiłem” z oferty bez przypisania odsyła do weryfikacji.
- Zero żądań sieciowych; zapis pod blokadą historii jak inne zapisy.
**Zależności:** brak twardych; zasila 3, 4 i 6. **W / T / R:** wysoka / średnia / średnie (granica kierunku, dlatego bez kwot). Eksperyment przed budową: tydzień notowania ręcznie 10 zakupów w pliku (data kupna, wystawienia, sprzedaży); jeśli właściciel nie chce ich wpisywać, rejestr będzie martwy i funkcja odpada.

### 3. Raport tygodniowy w „Dziś”
**Problem.** Plan dnia mówi „co dziś”, ale nikt nie mówi „czy to działa”: ile okazji faktycznie obejrzano, czy skan przynosi więcej, co się zepsuło.
**Widok.** Karta „Ostatnie 7 dni” w Dziś (rozwijana, w poniedziałek na wierzchu) i wydruk-widok do skopiowania: nowe oferty, okazje ogłoszone/obejrzane/odrzucone, mediana czasu reakcji, rozliczenie prognoz (trafione/spóźnione), frazy-szum i luki (z Fraz), źródła z blokadami, stan zapasu (jeśli funkcja 2), świeżość kopii. Zmiana względem poprzedniego tygodnia strzałką.
**Dane i pliki.** Tylko odczyt: `week-report.mjs` składa wyniki istniejących modułów (`deal-triage`, `deal-alerts`, `phrase-stats`, `data-health`, rozliczenie prognoz, `scan_runs`); trasa `GET /api/report/week?to=`; `app/views/today.js`. Bez migracji (stan „raport przeczytany” w `localStorage`).
**Kryteria.**
- Raport dla zadanej bazy testowej i czasu wstrzykniętego ma znane liczby; okno to dokładnie 7 pełnych dni, granica doby w czasie Europe/Warsaw (test na przełomie czasu letniego).
- Brakujący moduł danych (np. brak zapasu) pomija sekcję, nie wypisuje zer.
- Poprzedni tydzień bez danych: brak strzałki, nie „+∞%”.
- Nie dotyka sieci ani zapisu (test na bazie tylko do odczytu).
**Zależności:** pełna wartość po 2 i 4, ale działa bez. **W / T / R:** średnia / niska / niskie. Eksperyment: wygenerować raport tekstowy skryptem z kopii i ocenić, które 3 liczby właściciel naprawdę czyta.

### 4. Eksport i kopia: dane do ręki i pewność odtworzenia
**Problem.** Tylko ręczna kopia (`backup-catalog`, „Ustawienia -> kopie”); nie ma wyjścia z danych do arkusza ani sprawdzenia, że kopia da się odtworzyć. Rejestr zapasu (2) bez eksportu byłby zamkniętym pudłem.
**Widok.** W Ustawieniach „Dane”: (a) „Eksport CSV” dla okazji, zapasu, fraz, indeksu rynku; (b) „Kopia automatyczna” co dobę/tydzień z rotacją N ostatnich; (c) „Sprawdź kopię” (otwiera kopię w pamięci, `PRAGMA integrity_check`, zlicza tabele); (d) w „Dziś” plakietka „ostatnia kopia: 3 dni temu”, gdy > 7 dni. Opcjonalnie: eksport/import samej konfiguracji (frazy, cele, reguły) jako JSON z podglądem zmian przed wczytaniem.
**Dane i pliki.** `exports.mjs` (czysta funkcja `toCsv(rows, columns)`: średnik jako separator i BOM dla polskiego Excela, przecinek dziesiętny, ceny z groszy), trasa strumieniowa w `routes/<area>-routes.mjs`; harmonogram jako `scheduleBackup` w `background-jobs.mjs` z przełącznikiem `BOOKFLIP_AUTO_BACKUP=0` w tabeli `PRODUCTION-CATALOG.md`; używa istniejącego `backupCatalog`. Bez migracji (stan w ustawieniach).
**Kryteria.**
- CSV: polskie znaki, cudzysłowy i średniki w tytułach poprawnie zacytowane; cena 1234 gr -> `12,34`; wiersz z nieznaną ceną ma puste pole, nie `0`.
- Rotacja usuwa tylko pliki kopii o własnym wzorcu nazwy, nigdy innych plików w katalogu (test na katalogu tymczasowym z obcym plikiem).
- „Sprawdź kopię” wykrywa ucięty plik (test z obciętą kopią).
- Import konfiguracji bez zatwierdzenia nic nie zapisuje; ręczne frazy i przypisania zawsze wygrywają.
- Żadnych zapisów do `%LOCALAPPDATA%\BookFlip\data` w testach (izolowany katalog).
**Zależności:** brak. **W / T / R:** wysoka (bezpieczeństwo) / niska / niskie. Eksperyment: ręcznie przywrócić ostatnią kopię na czystej instancji i zmierzyć czas; jeśli się nie udaje, to jest błąd ważniejszy niż reszta mapy.

### 5. Wyszukiwanie sprzedawców, serii i autorów
**Problem.** Okazje są per oferta; właściciel nie umie zapytać „co jeszcze ma ten sprzedawca”, „jak się sprzedaje ta seria”, „który autor ma najlepszy obrót”. Paczki (zbudowane) pokazują tylko ≥ 3 oferty z wyceną.
**Widok.** Jedno pole „Szukaj” w pasku górnym i w palecie poleceń (klawisz `/`), wyniki w trzech grupach: Sprzedawcy, Serie, Autorzy. Karta sprzedawcy: aktywne oferty z wycenami, ile zniknęło w 30 dni, mediana odchylenia od wyceny, „tani hurt” czy „ceny rynkowe”. Karta serii/autora: obrót (indeks), liczba żywych ofert, mediana ceny, frazy, które to pokrywają i ich luki. Uwaga na kierunek: seria i autor służą wyłącznie ocenie obrotu i fraz skanu, bez list brakujących tomów (to odrzucone).
**Dane i pliki.** Tylko odczyt: `offers.seller_id` (indeks jest), `works`, `series`, `market-index.mjs`, `seller-bundles.mjs`; `entity-search.mjs`, trasa `GET /api/search/entities?q=`, `app/views/entity-search.js`. Bez migracji. Obserwowanie sprzedawcy (nowe oferty tego sprzedawcy) tylko z danych już skanowanych; osobne żądania na strony sprzedawcy to nowe zapytania przez bramkę i oddzielna decyzja.
**Kryteria.**
- Wyszukiwanie ignoruje wielkość liter i polskie znaki diakrytyczne („zelazny” znajduje „Żelazny”).
- Pusty `seller_id` nie tworzy „sprzedawcy bez nazwy” z tysiącami ofert.
- Karta sprzedawcy: liczby zgodne z zadanym zbiorem testowym; oferty bez wiarygodnej wyceny wyłączone z mediany.
- Zapytanie < 50 ms na zbiorze 100 tys. ofert (test wydajności na `:memory:` z indeksem).
- Zero żądań sieciowych.
**Zależności:** korzysta z fraz i paczek; wartość rośnie po 2. **W / T / R:** średnia / średnia / niskie. Eksperyment: zapytanie SQL na kopii o 20 sprzedawców o największej łącznej oszczędności i sprawdzenie, czy właściciel zna choć połowę z nich ze „stałych miejsc”.

### 6. Przypomnienia o obniżce i kalibracja szansy sprzedaży na własnych danych
**Problem.** Szansa 30 dni pochodzi z założenia „zniknięcie oferty = sprzedaż”. Własne wystawienia (po funkcji 2) pozwolą ją skalibrować, a sztuka leżąca dłużej, niż przewiduje krzywa, powinna zostać wskazana do obniżki ceny.
**Widok.** W „Zapas”: znacznik „leży 34 dni, przewidywane 20; sugerowana obniżka do X zł (środkowy próg -> próg „szybka sprzedaż”)”, przycisk „Obniżyłem cenę” zapisujący datę. W Rynku wskaźnik „twoja szansa vs szansa indeksu” po >= 20 sprzedanych sztukach.
**Dane i pliki.** Korzysta z tabel funkcji 2 (opcjonalnie kolumna `repriced_at`), `listing-card.mjs`, `liquidityModel` w `market-valuation.mjs`; nowy `stock-aging.mjs` (czysta funkcja). Kwoty obniżki to tylko sugestia z progów karty wystawienia, nic nie jest zapisywane jako zysk ani koszt.
**Kryteria.**
- Sztuka młodsza niż mediana czasu sprzedaży indeksu nie dostaje przypomnienia.
- Sugerowana cena nigdy nie jest wyższa od bieżącej ani niższa od progu „szybka sprzedaż”; brak wiarygodnej wyceny: komunikat „za mało ofert”.
- Kalibracja pokazuje liczbę prób i przedział; poniżej 20 prób komunikat „za mało danych”, bez liczby.
- Przypomnienie raz na 7 dni, odrzucenie („zostaw”) wycisza je do następnej zmiany ceny rynkowej.
**Zależności:** twardo od 2 i panelu Wystaw. **W / T / R:** średnia / niska / niskie. Eksperyment: po 4 tygodniach rejestru porównać prognozowany i faktyczny czas sprzedaży dla pierwszych sztuk; jeśli rozjazd > 2x, ostrzec o założeniu w indeksie.

---

## Kolejność i jedno zdanie
1. **A. Nawigacja (kroki 1-2, potem 3-4)**: scalić 9 pozycji do 7 grup z podzakładkami i 5 miejsc na telefonie, bez ruszania etykiet i adresów.
2. **B4 Eksport i kopia**: najtańsza i chroni dane przed budową rejestru.
3. **B1 Adaptacyjny snajper**: bez migracji, mniej skanów w nocy i szybsza reakcja w szczycie.
4. **B2 Rejestr kupione/wystawione/sprzedane** (bez kwot): zamyka pętlę, wymaga decyzji właściciela tylko jeśli miałby dotknąć kwot.
5. **B3 Raport tygodniowy**: odpowiada na „czy to działa” jednym ekranem.
6. **B6 Obniżka i kalibracja**: zamienia rejestr w poprawę prognoz, zależy od 2.
7. **B5 Szukaj sprzedawców/serii**: dobre, ale przy małej próbie sprzedawców wartość jest niepewna, więc po pomiarze.

## Trzy najlepsze
1. Rejestr (B2): jedyna funkcja, która mierzy, czy cały produkt zarabia (wymaga decyzji właściciela tylko dla kwot).
2. Adaptacyjny snajper (B1): tania, bez migracji, bezpośrednio poprawia to, co aplikacja robi najczęściej.
3. Nawigacja (A): ostatnie dodatki przepełniły pasek; grupy kosztują mało dzięki gotowemu wzorcowi Kolejki.

## Założenia, które kwestionuję
- Że każda nowa funkcja to nowa zakładka: pasek jest pełny, nowe rzeczy mają wchodzić jako podwidoki.
- Że „bez rejestru transakcji” musi znaczyć „bez żadnej pętli zwrotnej”: sam dziennik stanów i dat nie jest księgą rachunkową i pozwala sprawdzić prognozy.
- Że `CLAUDE.md` jest aktualny: pole „last: 139” rozmija się z migracją 141 (price_targets).
- Że snajper powinien działać równo przez dobę: napływ ofert nie jest równy (hipoteza do pomiaru).
- Że kopia ręczna wystarcza: dane są jedynym trwałym zasobem projektu.

## Kogo zapytać
- UX / frontend: o koszt kroków 1-2 nawigacji przy 24 testach czytających tekst `app/`.
- Backend/QA: o ocenę schematu `stock_items` i testy zmian stanu.
- Właściciel: nazwa grupy Rynek/Okazje, miejsce Fraz, zgoda na rejestr bez kwot.
