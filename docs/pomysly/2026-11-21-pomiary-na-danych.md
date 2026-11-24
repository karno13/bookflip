# Pomiary założeń mapy drogowej 2 na kopii danych (2026-11-21)

Metoda: kopia bazy przez `scripts/backup-catalog.mjs`, otwarta tylko do odczytu (`DatabaseSync` z `readOnly`), bez sieci. Skrypty i kopię usunięto po pomiarze. Kopia ma schemat do migracji 142 (bez 143-145; stąd brak tabeli `labels`, jest `work_labels`). Dane: 10 320 ofert (Vinted 6 647), 1 332 dzieł, 2 094 wydań, historia od 2026-11-01 do 2026-11-21 (17 dni z ofertami), 48 przebiegów skanu. Funkcje liczone kodem repo (`inflowCounts`, `sniperIntervals`, `listDeals`, `sellerBundles`, `searchEntities`).

## Tabela liczb

| Pomiar | Wynik |
|---|---|
| B1: oferty w oknie 28 dni / rozpiętość | 1 335 (po obcięciu pików) / 20,1 dnia; profil „enough” = tak (>= 14 dni, >= 200 ofert) |
| B1: szczyt/noc z `first_seen_at` | 38x (godz. 22 vs średnia 0-6); 133 z 168 komórek = 0 |
| B1: szczyt/noc z `listed_at` (Vinted, 28 dni) | 51x; ale patrz „Błąd pomiaru” |
| B1: skanów/tydz. stały vs adaptacyjny | baza 15 min: 672 vs 269 (-60%); 20: 504 vs 264; 30: 336 vs 256 (-24%); 60: 168 vs 168; adaptacyjny nigdy powyżej stałego, odstęp 15-60, noc średnio 52-54 min |
| Snajper w kopii | wyłączony; skan pełny co 12 h |
| B5: sprzedawcy Vinted z wiarygodnie wycenioną ofertą | 842 sprzedawców, 942 ofert; 775 ma 1 ofertę, 47 ma 2 |
| B5: oszczędność dodatnia łącznie / top-20 | 125 130 gr łącznie, top-20 = 44,9% (przy 26 ofertach); suma netto wszystkich ofert ujemna (-1 477 414 gr), więc udział netto bez sensu |
| B5: nazwy sprzedawców | `seller_name` NULL dla 6 561 z 6 561 ofert Vinted z identyfikatorem; top-20 to numery |
| Paczki (>= 3 oferty): liczba / oferty | 20 paczek, 73 oferty |
| Paczki: udział oszczędności | 2,6% oszczędności dodatniej; 2,9% oszczędności z ofert „okazyjnych” (>= 5 zł i >= 20%); netto paczek ujemne (-163 693 gr) |
| Okazje teraz | 198 (Vinted 128, Allegro Lokalnie 17, Vanaheim 14, Lagano 12, Tezeusz 10, Empik 7, Black Books 4, Skupszop 3, Dedalus 2, Conroy 1); obliczenie 257 ms |
| Cele „Kupuję do” | 0 |
| Etykiety / dzieła z etykietą | 7 etykiet, 342 dzieła (wpisy `work_labels`) |
| Zapas (`stock_items`) | 0 sztuk |
| Szukaj (`searchEntities`), 10 tys. ofert | pierwsze zapytanie (odbudowa katalogu sprzedawców) 131 ms; następne karty autorów/serii 80-190 ms, zapytania bez trafień 3-4 ms, karta sprzedawcy 14-93 ms |

## Błąd pomiaru, który zmienia wniosek o B1

`first_seen_at` to czas skanu, nie czas wystawienia. 48 skanów ma godziny skupione wieczorem (19-23: 29 z 48), a 10 320 ofert ma `first_seen_at` w 17 dniach, z czego 3 354 w jednym dniu (20 XI) i 2 397 w drugim. Ponad 90% ofert pojawia się więc w 5 godzinach wieczornych tylko dlatego, że wtedy właściciel skanował. `listed_at` też nie pomaga: z próbki wynika, że to czas skanu minus „3 dni”/„2 tyg.” z tekstu Vinted (minuty i sekundy równe `first_seen_at`), więc godzina dnia jest godziną skanu. Stosunek szczyt/noc 38-51x spełnia formalnie kryterium planu (>= 2x), ale mierzy zwyczaje skanowania, nie napływ rynku. Gorzej: profil adaptacyjny nakazałby snajperowi skanować dokładnie wtedy, kiedy skanowano dotąd, i nie skanować w nocy, więc nigdy by się nie dowiedział, czy w nocy coś napływa (pętla samopotwierdzająca).

## Wnioski według kryteriów planu

- **B1 adaptacyjny snajper: formalnie przechodzi (>= 2x, profil „enough”), merytorycznie niepotwierdzony.** Oszczędność budżetu (24-60% skanów) jest realna, ale oparta na danych skażonych harmonogramem. Dopóki snajper nie zbierze ofert z równomiernego skanu (np. 14 dni co 30 min całą dobę), profil nie mierzy rynku. Rekomendacja: zostawić domyślnie wyłączone (tak jest), a przed włączeniem zebrać dane zrównoważonym skanem albo ważyć napływ liczbą skanów w danej godzinie (oferty na skan zamiast ofert na godzinę). To zmiana w `inflow-profile.mjs`; wymaga osobnej zgody koordynatora.
- **Paczki sprzedawców: odpadają według własnego kryterium** (2,6-2,9% oszczędności w paczkach przy progu 15%). 775 z 842 sprzedawców ma jedną wycenioną ofertę; paczki to ogon. Nie rozwijać widoku paczek dalej; jeśli już zbudowany, nie rozbudowywać i rozważyć schowanie.
- **B5 sprzedawcy: odpada w obecnej postaci.** Top-20 trzyma 45% oszczędności, ale to pojedyncze oferty różnych sprzedawców bez nazwy (Vinted nie zapisuje `seller_name`), więc „czy znasz choć połowę z nich” jest nie do spełnienia, a wyszukiwanie sprzedawcy po nazwie działa tylko dla Empik. Wartość mają autorzy i serie (obrót), nie sprzedawcy. Wymóg < 50 ms nie jest spełniony już na 10 tys. ofert (80-190 ms dla kart autorów i serii; katalog sprzedawców cache'owany), a testowano by na 100 tys. Rekomendacja: zawęzić B5 do autorów i serii i zoptymalizować kartę (zapytania per wydanie) albo poluzować próg do 250 ms.
- **B2 rejestr zapasu i B6:** 0 sztuk, 0 celów; nie ma na czym mierzyć. Eksperyment z planu (10 ręcznych zakupów) jest nadal jedyną drogą; bez danych rejestru kalibracja (>= 20 prób) nie ruszy przez miesiące.
- **Rozkład źródeł:** 65% ofert i 65% okazji to Vinted; Allegro Lokalnie (559 ofert, 17 okazji), Empik i sklepy ze źródłami bez sprzedawcy dają resztę. 198 okazji naraz to dużo do triażu, więc raport tygodniowy (B3) ma sens bardziej niż B5.

## Czego nie dało się zmierzyć

- Prawdziwego napływu ofert na Vinted w czasie (dane skażone czasem skanów; do tego potrzebny równomierny skan).
- Dziennej liczby skanów snajpera w praktyce (snajper w kopii wyłączony; liczono tygodniowy budżet z modelu).
- Czy właściciel zna sprzedawców z top-20 (pytanie do niego; nazw brak).
- Czasu zapytania na 100 tys. ofert (kopia ma 10,3 tys.; liczono tu i oszacować liniowo nie wolno).
- Etykiet z tabeli `labels` i rejestru zapasu na migracjach 143-145 (kopia ma tylko do 142).
