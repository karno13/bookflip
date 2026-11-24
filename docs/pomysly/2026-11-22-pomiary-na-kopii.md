# Pomiary na kopii bazy (2026-11-22)

Źródło: `data/bookflip-catalog.sqlite` (kopia robocza projektu, stan z 2026-11-22, schemat 147). Wszystkie liczby z uruchomienia funkcji na kopii, bez sieci.

| Pytanie                                 | Wynik                                                                                                   | Wniosek                                                                                                                                                                                                                                                   |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ile ofert Vinted ma czas wystawienia?   | 4231 z 6668 (63%)                                                                                       | „Okno przewagi” działa na części ofert; 17 z 26 ogłoszonych okazji bez czasu wystawienia                                                                                                                                                                  |
| Ile ogłoszonych okazji?                 | 26 (próg 30)                                                                                            | „Okno przewagi”: za mało danych, wróci po kilku tygodniach snajpera                                                                                                                                                                                       |
| Ile ofert Vinted obniżało cenę?         | 146 z 6668 (2,2%); wśród ofert starszych niż 14 dni 71 z 1079 (6,6%); 709 zdarzeń obniżek w całej bazie | Poniżej progu 8% z mapy 4: sygnał obniżki jest słaby, „Prawie okazje” to wąska lista (15–24 oferty), nie główne źródło okazji. Uwaga: historia cen zapisuje tylko zmiany, więc „≥ 2 obserwacje” już oznacza zmianę ceny — nie wolno z tego liczyć odsetka |
| Odrzucenia (deal_triage)                | 0                                                                                                       | „Zwykle odrzucasz” nie ma jeszcze danych                                                                                                                                                                                                                  |
| Zapas                                   | 0 sztuk                                                                                                 | „Co przyniosło towar” czeka na zakupy                                                                                                                                                                                                                     |
| Okazje                                  | 202 (high 3, medium 80, low 119; 11 podejrzanych), z czego Vinted 131                                   | Domyślnie widać ~83 (bez niskiej wiarygodności)                                                                                                                                                                                                           |
| Trafność wycen (163 próby, 90 dni)      | mediana 1,03; w pasie 0,8–1,2: 41% (wysoka 76%, średnia 41%, niska 31%)                                 | Wycena nie ma obciążenia, ale duży rozrzut                                                                                                                                                                                                                |
| Wycena a sprzedaż                       | z potwierdzoną wcześniejszą sprzedażą 59% w pasie, bez niej 31% (105 prób)                              | Wycena bez żadnej sprzedaży to głównie zgadywanie                                                                                                                                                                                                         |
| Wycena do 15 zł                         | w pasie 4% (23 próby), sprzedaż średnio 1,46× wyceny                                                    | Najgorsza grupa; nie wiadomo, czy to cena wyjściowa ofert, czy rzadkie sprzedaże                                                                                                                                                                          |
| Współczynnik ceny ofertowej             | 0,8–1,0 daje medianę 1,08–0,95, w pasie 36–42%; obecne 0,9: 1,03 / 41%                                  | Blisko optimum, bez zmiany                                                                                                                                                                                                                                |
| Paczki sprzedawców                      | 21, wszystkie droższe niż wycena                                                                        | Domyślnie ukryte; tylko tańsze (zmiana 202)                                                                                                                                                                                                               |
| Oferty nieoglądane > 14 dni jako okazje | 3 z 202                                                                                                 | Wykluczone (zmiana 203)                                                                                                                                                                                                                                   |

Uwaga metodyczna: przekroje backtestu idą po wycenie, nie po cenie sprzedaży (podział po wyniku dałby pozorny błąd systematyczny dla tanich sprzedaży).

## Otwarte pytania z tych danych

1. Dlaczego wyceny < 15 zł są tak rozrzucone? Hipoteza: tanie książki wystawia się z ceną „na wyrost” i sprzedaje po negocjacji; sprawdzić z historią cen sprzedanych ofert (czy cena spadała przed sprzedażą).
2. Czy snajper znajdzie więcej okazji z czasem wystawienia, jeśli włączyć szczegóły ofert (pobieranie listed_at)? 37% ofert Vinted go nie ma.

## Stan egzemplarza a cena (eksperyment nr 2)

Eksperyment nr 2 z `kreatywna-2026-11-22.md` („Korekta wyceny o stan egzemplarza”). Kopia projektu otwarta tylko do odczytu (`node:sqlite`, `readOnly`); wycena liczona prawdziwymi funkcjami `estimateValue`, `marketObservations`, `valuationOptions` i `CONDITION_FACTOR` z `market-valuation.mjs`, tak jak w `listDeals`: oferty z aktywnym dopasowaniem do wydania (ISBN), wycena z pozostałych obserwacji wydania bez samej oferty, wymóg `sold + live >= 2`, „wartość” = wycena / współczynnik stanu. Skrypt: poza repozytorium (katalog roboczy sesji), kodu nie zmieniano.

### Wynik

- **Próba:** 2564 oferty z ISBN i wyceną (2290 kupowalnych jak w „Okazjach”, 1528 z Vinted kupowalnych). Mediana cena/wycena w całej próbie: około 1,2 (w pasie 0,8–1,2 mieści się 36,6% kupowalnych; po korekcie stanu, jak w „Okazjach”).
- **Informacja o stanie w tytule** (regex dobry stan: „nowa”, „jak nowa”, „nieczytana”, „idealny”, „bardzo dobry”, „bdb” itd.; regex zły stan: „zniszczona”, „pożółkła”, „ślady użytkowania”, „bez okładki”, „uszkodzona”, „zalana”, „podkreślenia” itd.; negacje typu „bez śladów” wycinane): **2,3% ofert** (59 z 2564; Vinted kupowalne 2,9%). Kryterium ≥ 20% **niespełnione, o rząd wielkości**.
- **Zły stan: 0 ofert.** Ani w próbie, ani wśród wszystkich 10 469 tytułów w kopii. Sprzedający nie wpisują wad w tytule. Porównanie „dobry vs zły” jest niewykonalne.
- **Mediana cena/wartość** (kupowalne): dobry 1,27 (n=53), brak informacji 1,20 (n=2237), zły: brak próby. W pasach wyceny: <20 zł dobry 1,64 (n=19) vs brak 1,30; 20–40 zł 1,16 (n=25) vs 1,25; 40–80 zł 1,10 (n=8) vs 1,10; ≥80 zł n=1. Różnica niespójna, bez wniosku; „dobry stan” w tytule nie zmienia stosunku cena/wycena.
- **Opisy:** `offer_raw_snapshots` (typ `detail`, 4333 ofert) zawiera tylko JSON z polami `item` (tytuł, cena), `condition`, `listedAge`, `photos`. **Opisu sprzedającego nie ma** (0 z 2000 przejrzanych zawiera `description`), a `vinted_detail_cache` go nie przechowuje. Słów stanu w opisach nie dało się więc zmierzyć; wymagałoby to nowego odczytu strony oferty (żądania przez bramkę).

### Najważniejsze odkrycie: stan jest już w wycenie

Hipoteza zakłada, że stan nie jest uwzględniany. Jest: `offers.condition_class` (z pola „Stan” Vinted i innych źródeł; znany dla 1851 z 2564 wycenionych ofert, 72%) już koryguje wycenę przez `CONDITION_FACTOR` (nowy 0,85, bardzo dobry 0,95, dobry 1, zadowalający 1,25), a `listDeals` dzieli wycenę przez ten współczynnik. Vinted kupowalne, mediana cena/wycena według pola stanu:

| Pole stanu | n | cena/wycena (surowo) | po korekcie stanu |
| --- | ---: | ---: | ---: |
| nowy | 377 | 1,43 | 1,22 |
| bardzo dobry | 834 | 1,30 | 1,24 |
| dobry | 271 | 1,11 | 1,11 |
| zadowalający | 41 | 0,94 | 1,18 |

Surowo stan wyraźnie różnicuje cenę (nowy 1,43 vs zadowalający 0,94, różnica ok. 50%), czyli sygnał stanu istnieje, ale po korekcie istniejącym współczynnikiem klasy wyrównują się do 1,1–1,24 (poza „dobry”, nowy i bardzo dobry zostają ok. 10% nad „dobrym”). Dla stanu „zadowalający” próba jest mała (41). Pozostały rozrzut (kwartyle po korekcie ok. 0,99 / 1,20 / 1,64) nie pochodzi więc ze stanu zapisanego w polu.

Przykłady „dobry” (tytuł → cena, wycena, cena/wartość, pole stanu): „Drugie pokolenie Dragonlance … NOWA” (Allegro Lokalnie) 50 zł / 10 zł / 4,24 / nowy; „Stan bardzo dobry” Durotan 15 zł / 9 zł / 1,58 / bardzo dobry; „nowa książka Fourth Wing …” 45 zł / 26 zł / 1,47 / nowy. Fałszywe trafienia regexu: „Nowy Dom Legenda Drizzta” (tytuł książki). Przykładów „zły stan” brak.

### Werdykt: odrzucić w tej postaci

Kryterium sukcesu nieosiągnięte (2,3% zamiast ≥ 20%; zły stan 0 trafień, więc różnica mediany niemierzalna). Flaga „zły stan, to nie okazja” oparta na słowach z tytułu nie miałaby czego flagować.

### Zalecany następny krok (jeśli w ogóle)

1. Nie budować regexów stanu na tytułach.
2. Prawdziwy pomiar jest możliwy tylko z opisem sprzedającego: osobny, tani test „czy opis zawiera wady” wymaga zapisu `description` ze strony szczegółów Vinted (rozszerzenie `source-details.mjs`, przez bramkę, z limitem długości w `offer_raw_snapshots`). To koszt (żądania, rozmiar bazy) przy niepewnym zysku; warto dopiero po zebraniu kilkuset opisów dla ofert, które już mają szczegóły. Do tego czasu wykorzystać istniejące pole stanu.
3. Tańsza alternatywa na istniejących danych: sprawdzić, czy współczynnik „zadowalający” 1,25 jest za duży (po korekcie 1,18 przy surowym 0,94 sugeruje, że tej klasy nie warto mnożyć 1,25; wymaga większej próby niż 41) oraz domknąć kompletność pola: 28% wycenionych ofert ma stan „unknown” (głównie źródła bez pola stanu).

## Powrót rzadkości (eksperyment nr 3)

Eksperyment nr 3 z `kreatywna-2026-11-22.md`. Kopia projektu otwarta tylko do odczytu; kodu nie zmieniano, skrypt poza repozytorium. Wycena i stosunek cena/wycena liczone prawdziwymi `estimateValue`, `marketObservations`, `valuationOptions` i `CONDITION_FACTOR` jak w `listDeals` (wycena wydania bez samej oferty, wymóg `sold + live >= 2`).

### Metoda

- **Próba:** 3212 ofert PLN z aktywnym dopasowaniem do znanego wydania (ISBN), 793 wydania.
- **Oś czasu wydania:** oferta jest „dostępna” od `first_seen_at` do końca: dla `sold`/`unavailable` to `availability_changed_at`, dla `not_seen` `last_seen_at`, dla pozostałych (`available`, `unconfirmed`) większa z `last_seen_at` i `availability_checked_at`. Przerwa = `first_seen_at` oferty minus najpóźniejszy koniec wcześniejszych ofert tego wydania; „powrót” wymaga co najmniej jednej wcześniejszej oferty (pierwsze w historii to osobna grupa).
- **Przerwy w obserwacji:** powrót liczony jako „pokryty”, jeśli w oknie przerwy źródło oferty było skanowane (z `scan_runs.summary_json` → `context.sources`) bez odstępu między skanami > 72 h. Pokrycie jest na poziomie źródła, nie frazy (skan frazowy nie widzi całego źródła), więc to wciąż przybliżenie na korzyść „powrotu”.
- **Zniknięcie:** `sold`, `unavailable`, `not_seen` (czas życia = koniec − pierwsze zobaczenie). Mediana wśród zniknięć jest obciążona (cenzura); dla porównania odsetki zniknięć w 7/14 dni liczone tylko z ofert starszych niż 7/14 dni.

### Wynik: historia jest za krótka, eksperyment niewykonalny

- **Długość historii:** `first_seen_at` od 2026-11-01 do dziś, czyli 20,5 dnia. Skany w `scan_runs`: 49, od 2026-11-01 do 2026-11-21. Historia statusów (`offer_status_history`, ścieżka `scan`/`check`) zaczyna się 2026-11-10 (12 dni; wcześniej tylko `backfill`).
- **Największa zaobserwowana przerwa dostępności wydania: 10,1 dnia.** Powroty po przerwie ≥ N dni: ≥ 3 dni: 14, ≥ 7: 4, ≥ 10: 1, **≥ 14: 0, ≥ 21: 0, ≥ 30: 0, ≥ 60: 0**. Kryterium (≥ 30 powrotów) niespełnione, próg 30 i 60 dni niemożliwy z definicji (historia krótsza niż próg).
- **Po wyłączeniu przerw w obserwacji:** ≥ 3 dni: 6 powrotów (z 14), ≥ 7 dni: 2 (z 4).
- **Próg 3 dni (tylko wskazówka, n=6):** czas życia zniknięcia 9,2 dnia (1 zniknięcie na 6), cena/wycena 1,44 (n=2); reszta: mediana czasu życia wśród zniknięć 6,9 dnia, zniknięcia w 7 dni 7% (n=2127), w 14 dni 11% (n=1090), cena/wycena 1,17 (n=2558). Próba za mała na jakikolwiek wniosek; kierunek (wolniej, drożej) nawet przeciwny do hipotezy, ale to szum.
- **Uniwersy** (regex Warhammer/Dragonlance/Warcraft w tytule oferty, dzieła lub wydania): wśród 14 powrotów 1; dla porównania w całej próbie 26% ofert (833 z 3198 poza powrotami).
- **Ciekawostka z porównania:** oferty wydań widzianych pierwszy raz w historii (793) znikają nieco częściej niż powtórne (14 dni: 15% vs 9%), ale to inna hipoteza i obciążona tym, że „pierwsza w historii” często oznacza początek obserwacji.

### Werdykt: nierozstrzygnięte z braku danych (nie odrzucone)

Kryterium sukcesu nieosiągnięte: 0 powrotów po ≥ 30 dniach zamiast ≥ 30. Hipotezy nie da się ani potwierdzić, ani obalić; sam pomiar jest poprawny, brakuje czasu obserwacji.

### Zalecany następny krok

1. Nic nie budować. Powtórzyć ten sam pomiar (skrypt gotowy, tylko odczyt) około 2026-12-25 (60 dni historii statusów dopiero od 2027-01), z progiem 30 dni; do tego czasu wykonalny jest najwyżej próg 14 dni.
2. Warunek wstępny jakości: skany frazowe snajpera zapisywać w sposób pozwalający orzec „fraza X w źródle Y była skanowana w dniu D” na poziomie wydania (dziś pokrycie tylko na poziomie źródła). Bez tego powroty po przerwie mogą być zwykłymi lukami w obserwacji.
3. Jeśli po 30+ dniach próba przekroczy 30 powrotów, porównać też z grupą „pierwsze w historii”, a nie tylko z resztą.

## Wycena a cena nowego (pomysł nr 7)

Pomysł nr 7 z `kreatywna-2026-11-22.md`. Kopia projektu otwarta tylko do odczytu, bez sieci, kodu nie zmieniano, skrypt poza repozytorium. Liczone prawdziwymi `marketObservations`, `estimateValue`, `valuationOptions` i `listDeals` (stan 2026-11-22).

### Skąd cena nowego

Oferty rodzaju „Nowe w sklepie” w bazie: Empik 1028, Vanaheim 113, Lagano 96, Dedalus 4 (BN, Copernicus i Insignis nie są źródłami ofert; cen katalogowych z metadanych nie użyto). Cena nowego wydania = najniższa aktualna oferta sklepowa. Wycena używanego = `estimateValue` z samych ofert niesklepowych (inaczej porównanie byłoby kołowe: wycena już miesza ceny sklepowe z wagą 0,3 i współczynnikiem 0,6). Wymóg jak w okazjach: `sold + live >= 2`.

### Rozkład wycena / cena nowego

- Wydań z jakąkolwiek ofertą sklepową: 119 (wszystkie z aktualną ceną); porównywalnych (wycena używanego + cena nowego): 81.
- Percentyle p10/25/50/75/90/max: 0,39 / 0,59 / 0,73 / 1,02 / 1,77 / 3,80. Mediana 0,73, czyli używane zwykle tańsze od nowego.
- **Powyżej 1,0: 22 z 81 (27%), powyżej 1,3: 17 (21%), powyżej 2,0: 6.**
- Pewność wyceny w całej próbie: low 52, medium 27, high 2. **Wśród 17 przypadków > 1,3: low 14, medium 3, high 0.** Wszystkie mają n ≤ 6 obserwacji (poza „Drugie pokolenie”, n=13, kwota 10 zł), zero sprzedanych poza jednym.
- Mediana roku wydania: 2016 dla > 1,3 (n=15) wobec 2020 dla reszty (n=60). Lekka przewaga starszych, ale w próbie są też świeże (Klątwa Khaina 2025, Ogród plagi 2023, Mroczne Imperium 2022).
- Przykłady: Smoki krasnoludzkich podziemi 3,80 (wycena 19 zł, nowe 5 zł, n=2), Bitwa o Otchłań 3,41 (150 zł wobec 44 zł, n=2), Indomitus 3,27 (150 zł wobec 46 zł, n=4), Mroczne Imperium: Boska Śnieć 2,27, Smoki upadłego słońca 2,18 (medium, 1 sprzedaż).

Wniosek o wyczerpaniu nakładu: nie da się go ocenić z tych danych, bo każde z wydań ma ofertę sklepową „dostępną” w chwili pomiaru (żadnego „bez aktualnej oferty nowego”) i prawie żadna wysoka wycena nie ma sprzedaży. Wysokie stosunki wyglądają głównie na **artefakty małej próby** (2-4 ceny wywoławcze, często jedna zawyżona), nie na dowód wyczerpania. Teza „wycena > nowe = priorytet zakupu” nie ma poparcia.

### Klucz: okazje, w których nowe jest taniej niż wycena

`listDeals` na kopii: 202 okazje (wszystkie widoczne). 32 z nich to same oferty sklepowe (Vanaheim, Lagano, Empik), ocenione względem wyceny używanych z peerów, głównie low (27 z 32). To osobny przypadek: tu „okazja” to ofertę nowego poniżej wyceny używanego, więc z definicji nie ma taniej nowej; zasadność zależy tylko od wyceny.

Dla 170 okazji z ofert używanych (Vinted, Allegro Lokalnie, Skupszop itd.): aktualną cenę nowego ma 34 (20%).

- **Wycena (`worth`) powyżej ceny nowego: 9 z 34, tj. 9 z 170 okazji (5,3%)**; pewność: low 6, medium 3. Powyżej 1,3× nowego: 6.
- **Sama cena oferty >= cena nowego (nowe jest nie droższe niż oferta): 4 okazje**: Kosmiczny wilk (Vinted 80 zł, nowe 71,05 zł), Wampirzyca Urlika trylogia (Skupszop 46,84 zł, nowe 43,99 zł), Smoki upadłego słońca (Vinted 10 zł, nowe 7,80 zł), Ucieczka Eisensteina (Vinted 67 zł, nowe 67 zł). Pewność wyceny: low 3, medium 1.
- Wniosek: okazje „nie prawdziwe, bo taniej nowa” to **5% listy, a bezwzględnie nieopłacalne (oferta nie taniej niż nowe) 4 z 170, ok. 2%**. Pozostałe 5 z 9 to oferty tańsze od nowego, ale wycena używanego sięga ponad nowe (kierunek: zawyżona wycena, nie błąd okazji).

### Werdykt

Efekt realny, ale mały: 9 okazji na 202 (4%) ma wycenę powyżej dostępnej ceny nowego, wszystkie z pewnością low/medium; wysokie stosunki w całym katalogu to głównie szum małej próby. Dla właściciela użyteczne jest nie „sygnał wyczerpania”, tylko prosty **limit sanity**: wycena używanego nie powinna przekraczać ceny nowego w sklepie, gdy ta jest dostępna.

### Zalecany następny krok

1. Tania flaga w karcie okazji: „Taniej nowa w sklepie X: NN zł” wyświetlana, gdy najniższa aktualna oferta sklepowa tego wydania <= cena oferty (to jest dosłownie „kup nowe taniej”; dziś 4 przypadki). Bez zmiany rankingu i wyceny, tylko odczyt (`marketObservations` już ma te dane), test na `:memory:`.
2. Osobno do rozważenia (po decyzji, bo zmienia wycenę): przycięcie `worth` do ceny nowego przy confidence low/medium (dotknęłoby 9 okazji); najpierw sama flaga i obserwacja werdyktów właściciela („overvalued”).
3. Nie budować „wskaźnika wyczerpania”: wymaga danych o dostępności nowego w czasie (historia ofert sklepowych), której nie ma (20 dni historii).

## Ciemna materia uniwersów (wieczór nr 1)

Pomiar tylko do odczytu na kopii `data/bookflip-catalog.sqlite`, bez sieci i zmian kodu. „Kupowalne” = dostępność `available` lub `unconfirmed` z ceną (9 864 ofert wszystkich źródeł). „Uniwersum” = tytuł pasuje do Warhammer / 40K / Black Library / Herezja Horusa / Dragonlance / Smocza Lanca / Warcraft lub do polskich tytułów Dragonlance z `starter-profiles.mjs` (1 151 ofert). „Nierozpoznana” = brak aktywnego dopasowania do wydania. Dopasowanie po samym tytule służyło wyłącznie do wyboru próby, nie do przypisań.

### Wynik

| | Kupowalne | Bez aktywnego wydania | Odsetek | Bez obcych języków, wykluczeń i nie-książek |
|---|---|---|---|---|
| Uniwersa | 1 151 | 317 | **27,5%** | 188 (**16,3%**) |
| Cały rynek | 9 864 | 6 614 | 67,1% | 1 690 (17,1%) |

Surowe 67% dla całego rynku to artefakt: 4 670 ofert ma ostatnią decyzję „usunięcie z katalogu” (wykluczone). W uniwersach: Vinted 65 z 614 (10,6%), pozostałe źródła 252 z 537 (47%; Empik 114, Allegro Lokalnie 56, Vanaheim 39, BlackBooks 14, Lagano 14).

### Dlaczego nierozpoznane (uniwersa, 317)

Obcy język 88 (głównie Empik, angielskie), w kolejce bez ISBN (`no_isbn_evidence`) 81, zadanie zakończone bez dopasowania 67 (w tym 30 „oferta jest zestawem”), w kolejce `isbn_not_found_in_metadata_sources` 40, `game_rulebook` 15 (podręczniki, gry), `possible_bundle` 11, `isbn_title_mismatch` 5, wykluczone 7, nie-książka po tytule 3.

### Nierozpoznane „do zrobienia” (188 ofert, suma cen 25 931 zł, mediana 71 zł)

- ISBN gdzieś dostępny (obserwowany, cache szczegółów, wzbogacenie, migawka): 123 ze 317 nierozpoznanych, z czego 58 jest już w katalogu (wydanie istnieje, a oferta nie ma dopasowania: zestawy i `possible_bundle`/`isbn_title_mismatch`, czyli rozstrzygnięcie ręczne, nie brak danych). Wśród 188 „do zrobienia” ISBN w katalogu ma 46; **brak jakiegokolwiek ISBN: 90 ofert (69 z nich w kolejce)**.
- W kolejce przeglądu: 165 ofert uniwersów (81 brak ISBN, 40 ISBN nieznany źródłom, 28 `game_rulebook`, 11 pakiety, 5 niezgodność tytułu).
- Ścieżka propozycji tytułowych (`title_proposals`, tylko wypełnia pole ISBN, właściciel zatwierdza): 59 nierozpoznanych ma jakąkolwiek propozycję, 19 pewność high; wśród 188 „do zrobienia” tylko **5 high** (2 z ISBN spoza katalogu, np. Czas Wilka tom III, 9788371697661).
- Ceny: nierozpoznane uniwersa p25/mediana/p75 = 45,9 / 85 / 177 zł (średnia 156), rozpoznane 20 / 40 / 80 zł (średnia 67). Droższe, ale to głównie ceny sklepowe Empik/Vanaheim (podręczniki do 485 zł), a nie okazje z Vinted.

### Werdykt wobec kryterium (≥ 40% nierozpoznanych)

**Nie spełnione**: 27,5% surowo, 16,3% po odjęciu obcych języków, wykluczeń i nie-książek. Rozpoznawanie nie jest wąskim gardłem uniwersów, a na Vinted (źródło snajpera) to tylko 10,6%. Pozostała ciemna materia to głównie oferty sklepowe i bez ISBN.

### Najtańszy następny krok (zgodny z „tylko dowody ISBN”)

Filtr/kubełek „uniwersa” w kolejce przeglądu (tylko widok: sortowanie po cenie, bez żadnego przypisania): 69 ofert bez ISBN i 40 z ISBN nieznanym źródłom, które właściciel może zamknąć ręcznym ISBN z okładki. Lista znanych ISBN per uniwersum i podpowiedzi z okładek dają mało: tylko 5 propozycji high, 90 ofert bez żadnego ISBN w danych. Nie robić nowego automatu przypisań.

Czego nie sprawdzono: rozpoznawanie uniwersum po tytule jest przybliżone (regex, bez serii z katalogu), a `unconfirmed` mogą zawierać nieaktualne oferty.

## Czy jesteśmy pierwsi (wieczór nr 2)

Pomiar na kopii `data/bookflip-catalog.sqlite` (tylko odczyt, bez sieci, bez kodu). **Snajper nigdy nie działał w tej kopii:** `scan_schedule.sniper` ma `enabled:false`, `lastRunAt:null`; jest 49 przebiegów w `scan_runs` (2026-11-01 do 2026-11-21), to zwykłe skany wsadowe co kilka godzin do kilku dni (harmonogram ogólny co 12 h). Wszystkie liczby poniżej opisują więc zwykłe skany; podział „snajper vs zwykłe” i „uniwersa vs reszta” nie jest możliwy (skan nie zapisuje trybu ani listy fraz poza `summary_json.context.queries`).

### (a) Opóźnienie wykrycia (`first_seen_at` minus `listed_at`, Vinted)

- 4231 ofert Vinted ma `listed_at`, ale rozdzielczość jest zgrubna: etykieta „min” (19), „godz.” (261), „dni” (349), „tyg.”/„mies.”/„lat” (ponad 3300). „wczoraj” wypada jako 0 ofert (przeliczane na dni). Większość ofert to pierwsze wczytanie całych list (14.11, 16.11, 20.11), więc ich „opóźnienie” to wiek oferty, nie czas reakcji.
- Tylko oferty wystawione ≤ 7 dni przed pierwszym zapisem (n=630): mediana 48 h, p75 144 h, p90 168 h; ≤ 30 min: 2%, ≤ 3 h: 14%.
- Tylko etykiety „min”/„godz.” (n=280, rozdzielczość ok. 1 h): mediana 6 h, p75 9 h, p90 12 h. Same „min” (n=19): mediana 18 min, ale to garstka.
- Oferty z `deal_alerts` z datą (n=9): mediana 6 h, p90 72 h.
- **Werdykt: kryterium „mediana ≤ 30 min” NIE spełnione; > 3 h = wąskie gardło to interwał i lista celów** (tu: zwykłe skany, nie snajper, więc to dolna granica tego, co snajper ma poprawić). Zastrzeżenie: obciążenie próby, widzimy tylko oferty, które w ogóle złapaliśmy.

### (b) „Duchy”

- Vinted: 504 ofert zniknęło (sold 265, unavailable 201, not_seen 38); z nich 159 (32%) widziano tylko raz. Wśród ofert z `seen_count=1` i `last_seen=first_seen` (2344) 159 jest już sprzedanych/niedostępnych (przy `not_seen` 22).
- **Werdykt: ≥ 15% zniknięć to duchy: spełnione (ok. 32%)** — interwał jest za długi (zastrzeżenie: część to oferty zakończone, których i tak nie dałoby się kupić; kopia nie rozróżnia „sprzedane po 1 skanie” od „pierwszy zapis już sprzedany”: pierwszy status `sold`/`unavailable` ma tylko 21 ofert, via backfill).

### (c) Alerty znikające przed obejrzeniem

- `deal_alerts` ma `seen_at`: 26 alertów (20-22.11), 22 obejrzane (jedno kliknięcie zbiorcze ok. 1,2-1,4 h po alercie), 4 nieobejrzane (15%). Żaden z 4 nie zniknął (dostępność `unconfirmed`); `not_seen` ma 3 alerty z 26 (12%), `available` 1.
- **Werdykt: < 25% niewidzianych: spełnione, ale n=26 i alerty działały tylko ok. 1 dobę; wniosek wstępny.** Alert jest widziany po ok. 1,2 h, ale nie wiemy, czy oferta jeszcze istniała (dostępność alertów prawie zawsze `unconfirmed`).

### Wniosek i najtańszy następny krok

Szybkość JEST problemem (mediana wykrycia godziny, duchy ok. 1/3 zniknięć), ale mierzymy ją na skanach wsadowych. Najtańszy krok: włączyć snajpera na dobę i przed tym dodać do `summary_json.context` pole `mode` (`sniper`/`batch`) oraz zapisywać stan dostępności oferty z alertu w chwili `seen_at`; po dobie powtórzyć ten pomiar na ofertach z etykietą „min”.

Notatka (zapis do powtórzenia pomiaru): od teraz `scan_runs.summary_json.context` ma `mode` (`batch`|`newest`) i `trigger` (`manual`|`schedule`|`quick`|`sniper`; starsze przebiegi nie mają pola), a `deal_alerts.seen_availability` (migracja 150) trzyma dostępność oferty w chwili `seen_at`. Powtórzenie po dobie ze snajperem: włączyć snajpera w „Okazje”, po 24 h policzyć (a) `first_seen_at - listed_at` tylko dla ofert, których pierwszy zapis pochodzi z przebiegu `trigger=sniper` (łączyć po `scan_offer_results.scanned_at = scan_runs.scanned_at`), z etykietą „min”/„godz.”; (b) duchy: oferty z `seen_count=1`, które zniknęły, osobno dla `sniper` i reszty; (c) odsetek alertów z `seen_availability` innym niż `available`/`unconfirmed` (czyli zniknęły przed obejrzeniem).

## Pokrycie: schwytaj i złap (wieczór nr 3)

Pomiar na kopii `data/bookflip-catalog.sqlite` (odczyt, bez sieci, bez kodu; skrypty w katalogu roboczym, nie w repo). Dane: 6668 ofert Vinted, każda ma `matched_queries_json`; tylko 259 (4%) ma więcej niż jedną frazę. Źródła stacjonarne mają podobnie niski udział (Empik 138 z 1410, Tezeusz 2 z 615), więc dla nich nie liczono.

### Wyniki (Vinted, estymator Chapmana, 95% przedział z wariancji Seber)

Zbiór A = oferty znalezione frazą ogólną, B = oferty znalezione którąkolwiek frazą autora/tytułu; pula = oferty, których tytuł zawiera nazwę uniwersum/autora.

| Zbiór | n1 | n2 | n12 | Suma | Estymata | Pokrycie |
|---|---|---|---|---|---|---|
| Warhammer (fraza „Warhammer” vs Abnett, King, McNeill, Herezja Horusa, Gotrek, Fulgrim) | 128 | 86 | **0** | 214 | brak (n12=0) | nie do policzenia |
| Dragonlance („Dragonlance” vs Weis, Knaak) | 65 | 15 | **0** | 80 | brak | nie do policzenia |
| Warcraft („Warcraft” vs Golden, Krwawy Sztorm) | 337 | 67 | **0** | 404 | brak | nie do policzenia |
| Pratchett („Terry Pratchett” vs 19 tytułów/„Świat Dysku”) | 489 | 764 | 75 | 1178 | 4931 (3970-5892) | 24% (20-30%) |
| Pratchett („Terry Pratchett” vs sam „Świat Dysku”) | 489 | 115 | 75 | 529 | 747 (657-837) | 71% (63-81%) |
| Sapkowski („Sapkowski” vs Wiedźmin, Zabójca, Zdrajca, Szczurołap) | 405 | 742 | 151 | 996 | 1984 (1762-2205) | 50% (45-57%) |
| Sanderson, Maas | 217/169 | 2/1 | 0 | - | brak | nie do policzenia |

### Dlaczego wynik jest nieważny (to jest główny wniosek)

- **Przechwycenia nie są niezależne, tylko rozłączne z konstrukcji.** Skan odrzuca wynik, którego tytuł nie zawiera frazy (w ostatnim przebiegu `rejected.topic` = 10056 wobec 1323 znalezionych), więc „fraza” działa jak filtr podciągu tytułu. Oferta trafia do dwóch fraz tylko, gdy jej tytuł zawiera oba słowa. n12=0 dla trzech uniwersów znaczy „tytuły nie zawierają obu naraz”, a nie „pokrycie bliskie zera”. Nakładanie mierzy współwystępowanie słów w tytule, nie powtarzalność wyszukiwarki.
- Estymaty Pratchetta i Sapkowskiego (24-71% zależnie od doboru fraz B) rozjeżdżają się trzykrotnie przy zmianie zestawu B, co potwierdza, że to artefakt doboru, nie pomiar. Zależność zwykle zawyża pokrycie (ten sam ranking Vinted), tu działa w obie strony.
- Okno czasu: ta sama oferta ma sumę fraz z kilku dni (frazy Sapkowski/Wiedźmin/Harry Potter/Maas zostały zeskanowane tylko 20.11, „Zabójca” 16.11, „Mort” 14.11), więc A i B nie były łapane w tym samym czasie. Zawężenie do ofert z `first_seen_at` >= 14.11 daje Pratchetta 15% (n12=10), a >= 20.11 próbę n=14; to potwierdza brak stabilności.
- Zbiory są małe w uniwersach (n2 = 15-86, n12 = 0), więc nawet poprawny model nie dałby przedziału.

### Strony: odczytane vs dostępne (`scan_runs`, 707 odczytów Vinted w 49 przebiegach)

- Wszystkie 707 odczytów skończyły się stanem `end` (żadne nie zatrzymało się na `more`/limicie 50 stron w `scan-engine.mjs`). Błędów 0.
- Szerokie frazy kończą dokładnie na 10 stronach w każdym przebiegu: Warcraft 20/20 (10 str., ok. 52-59 trafień na ostatniej), Terry Pratchett 16/16, Fourth Wing 4/4; Salvatore max 9. Warhammer 8-9 stron (ostatnia zwykle pełna ok. 60-80 trafień). Pełna ostatnia strona i stała liczba 10 sugerują **limit głębokości po stronie Vinted (ok. 10 stron)**, a `end` pochodzi z `totalPages` źródła, więc nie jest to obcięcie przez nasz limit, ale też nie dowodzi kompletności: wyniki za 10. stroną są dla nas niewidoczne (hipoteza, nie sprawdzona bez sieci). Wąskie frazy (autorzy, tytuły) mają 1-5 stron, bez ryzyka.

### Werdykt względem kryterium

Kryterium (<70% luka, >=90% brak problemu) **nie da się rozstrzygnąć** na `matched_queries_json`: estymata zależy od doboru fraz i jest bez sensu przy rozłączności. Surowa liczba, której można ufać: skany Vinted nie są obcinane naszym limitem stron, ale najszersze frazy (Warcraft, Pratchett, Fourth Wing) dochodzą do ok. 10. strony i możliwe, że kolejne oferty są ukryte.

### Najtańszy następny krok

1. Prawdziwe powtórne przechwycenie tej samej frazy w czasie: dla „Warcraft”/„Terry Pratchett” porównać zbiory z dwóch kolejnych przebiegów (nie z różnych fraz); wymaga zapisu listy identyfikatorów na odczyt (dziś jest tylko suma `matched_queries_json`), tj. małej zmiany w `summary_json` albo tabeli.
2. Jednorazowo (bramka, 1-2 żądania): ta sama fraza z innym sortowaniem (np. „najnowsze” vs trafność) i porównanie z odczytem domyślnym; jeśli drugi widzi >10% ofert spoza pierwszego, szerokie frazy mają lukę i trzeba węższych podziałów (autor + tytuł) zamiast głębszych stron.
3. Nie dokładać stron: limit 50 nie jest wąskim gardłem.

### Weryfikacja na żywo: limit 10 stron potwierdzony (14 żądań przez bramkę, 2026-11-22)

- Adres skanera już zawęża do kategorii książek (`/catalog/2312-books`), więc szum miniatur odpada; bez kategorii „Warhammer” ma 960 wyników (limit), z kategorią 771 (9 stron).
- Strona 10 ma `totalPages=10`, strona 11 i 12 są puste (0 ofert). Jedna strona to 96 ofert, `total_entries` „Warcraft” = 960 = 10 x 96 (limit po stronie Vinted).
- Filtry cenowe działają w adresie: „Warcraft” do 30 zł = 484, od 30 zł = 648 (suma 1132 > 960, czyli co najmniej 172 oferty były ukryte).
- Zrobione: fraza, która dochodzi do 10. strony, jest czytana dodatkowo w przedziałach cenowych (do 15, 15-30, 30-60, od 60 zł), do 40 dodatkowych stron na skan; odczyt niepełny nie jest „end”. Test: `test/vinted-depth-cap.test.mjs`.

- Granice przedziałów (5 żądań przez bramkę, 2026-11-22, „Warcraft” w książkach): `price_to=15` (od najdroższych) i `price_from=15` (od najtańszych) pokazują oferty za dokładnie 15,00 zł, a `price_from=15&price_to=15` też zwraca 15,00 zł; to samo przy 30. Obie granice są włącznie, przedziały (do 15, 15-30, 30-60, od 60) nie mają luk, zachodzą na siebie tylko na granicy (dedup po adresie).
- Naprawa starych znaczników: jednorazowo `vinted_capped_not_seen_v1` (`repairCappedNotSeen`) przywraca „niepotwierdzona” ofertom, które oznaczył tylko odczyt dochodzący do 10. strony (opiera się na `scan_runs` z chwili znacznika i `offer_queries`): na kopii 34 z 38. Indeks rynku (`liquidityModel`, czas ustalony) po naprawie: zmiana w 8 z 548 edycji, łączny czas ofert 26 155,1 → 26 173,7 dni, sprzedaże 174 bez zmian; wycena (`market-valuation.mjs`) nie używa „not_seen”.

## Nisza czy szeroki rynek (wieczór nr 14)

Kopia `data/bookflip-catalog.sqlite` (kopia robocza w scratchpad), `listDeals` bez zmian, 210 okazji (żywe, kupowalne). „Uniwersum” = tytuł oferty pasuje do wzorców `seriesUniverses()` (ta sama definicja co karta „Uniwersa”; 8 uniwersów). Oczekiwany zysk w groszach: oszczędność × szansa sprzedaży, jak w rankingu aplikacji. „Pewne” = pewność wyceny medium lub high (high ma 6 okazji, wszystkie poza uniwersami).

| Grupa (po tytule) | Okazje | w tym pewne (med+high) | low | Oczekiwany zysk: medium+high | low |
|---|---|---|---|---|---|
| Uniwersa | 62 | 33 (medium 33, high 0) | 29 | 109 zł | 206 zł |
| Poza uniwersami | 148 | 58 (medium 52, high 6) | 90 | 201 zł | 354 zł |

Okazje na 100 żądań do Vinted (50 przebiegów, 1872 żądania; liczone 140 okazji z Vinted, każda ma co najmniej jedną frazę w `offer_queries`; grupa fraz: fraza pasuje do wzorca uniwersum):

| Frazy | Żądania | Okazje Vinted | Pewne | Okazje/100 | Pewne/100 |
|---|---|---|---|---|---|
| Uniwersa (Warcraft, Warhammer, Świat Dysku, Dragonlance, Forgotten Realms, Herezja Horusa, Czarna Biblioteka) | 582 | 24 | 15 | 4,1 | 2,6 |
| Pozostałe (209 fraz minus te) | 1290 | 116 | 55 | 9,0 | 4,3 |

Stosunek pewnych okazji na żądanie: 4,3 / 2,6 = **1,65**, czyli poniżej kryterium 2×. Przy podziale po tytule oferty (Vinted: uniwersa 21 pewnych, poza 49) wynik jest podobny.

Ograniczenia, które decydują o odczycie:
- **Nie ma „szerokiego rynku” do porównania.** Wszystkie 209 fraz to frazy niszy właściciela (autorzy i tytuły uniwersów: Pratchett, Salvatore, Abnett, Knaak, Weis…, ale też Sanderson, Maas, Harry Potter, Wiedźmin). „Pozostałe” to więc nisza szeroko rozumiana, a nie losowa próba rynku; autorzy Pratchett/Salvatore/Abnett wchodzą do „pozostałych”, choć należą do uniwersów po autorze. Pytanie z hipotezy (szeroki rynek vs nisza) nie ma tu danych, na które można odpowiedzieć.
- **Obcięcie odczytów Vinted (do commitu 68a33a5) zaniża okazje fraz szerokich.** Frazy, które dochodzą do 10. strony (960 ofert: Warcraft, Pratchett, Fourth Wing, Warhammer), widziały tylko wierzch wyników, a oferty poza nim nie trafiały do bazy; ich liczba okazji jest zaniżona, a żądania (10 stron na odczyt) policzone w całości, więc okazje/100 dla szerokich fraz jest zaniżone. Kierunek: faworyzuje wąskie frazy, nie wiadomo o ile.
- Frazy dzielą oferty (jedna oferta może mieć kilka fraz; przypisanie do „uniwersa”, jeśli którakolwiek pasuje). 70 okazji spoza Vinted nie ma żądań w tym rachunku.
- Próby małe (24 i 116 okazji, 15 i 55 pewnych); nie liczono przedziałów.

**Werdykt:** kryterium (szeroki rynek >= 2× pewnych okazji na żądanie) **nieosiągnięte** (1,65, w dodatku bez prawdziwej próby szerokiej). Nie mówię właścicielowi „uniwersa to hobby, nie źródło dochodu”: dane tego nie pokazują; uniwersa dają 30% okazji (62/210) i 29% oczekiwanego zysku z pewnych (109 z 310 zł) przy 31% żądań (582/1872), czyli tyle, ile wynika z udziału w żądaniach. Priorytetów nie zmieniono. Żeby rozstrzygnąć: jednorazowa losowa próbka szerokich fraz poza niszą (kilkadziesiąt żądań przez bramkę) i dopiero wtedy porównanie.

## Okazja poniżej minimum (wieczór nr 10)

Warunek: cena okazji jest **ściśle niższa** od każdej innej żywej, kupowalnej oferty tej samej edycji (PLN, dostępna lub niepotwierdzona, widziana w ostatnich 14 dniach, cena < 10 000 zł; wszystkie źródła, także sklepy z nowymi). Każda okazja ma co najmniej jedną inną ofertę (liczone z `listDeals`, 210 okazji).

| Pewność wyceny | Okazje | Poniżej wszystkich innych | Odsetek | (<=, remisy liczone) |
|---|---|---|---|---|
| high | 6 | 2 | 33% | 2 |
| medium | 85 | 42 | 49% | 55 |
| low | 119 | 84 | 71% | 91 |
| razem | 210 | 128 | **61%** | 148 (70%) |

Kryterium 30-70%: **spełnione** dla całości (61%) i dla medium (49%); filtr zostawia około 6 na 10 okazji i najmocniej odsiewa tam, gdzie wycena jest pewniejsza (medium: połowa okazji ma tańszą lub równie tanią ofertę tej edycji). Dla low (71%) prawie wszystko przechodzi, więc filtr tam niewiele dodaje; w high próba (6) za mała. Uwaga: wycena opiera się na ofertach tej samej edycji, więc „najtańsza z dostępnych” często jest po prostu najniższą z próby wyceny; ilu z odsianych okazji (kolejne tańsze oferty) i tak da się kupić, mierzy tylko `listDeals` na kopii, nie zachowanie po odsianiu. Nie wdrożono nic.

## Wydajność fraz (wieczór nr 8)

Metoda (kopia z 2026-11-22, 49 przebiegów, 41 z `context.results`, ostatni 2026-11-21T23:24Z): żądania = suma `pages` z `summary_json.context.results` na (źródło, fraza); nowa oferta = `first_seen_at` równy `scanned_at` przebiegu i fraza przebiegu w `matched_queries_json` (oferta z kilku fraz dzielona ułamkami); okazja = oferta z dzisiejszego `listDeals` (202 pozycje: 131 Vinted, 71 inne), a nie okazja z chwili zobaczenia (tego z danych nie da się odtworzyć). Wariant „powtórki” pomija pierwszy przebieg każdej frazy (pierwsze wczytanie wnosi cały zasób, nie napływ). Skrypt: scratchpad `e8.mjs`.

**Vinted** (powtórki: 67 fraz z >= 3 żądaniami, 1283 żądań, 481 nowych ofert, 36 okazji): okazje na 100 żądań: górny kwartyl 3,48, dolny 0,00; 58 z 67 fraz bez żadnej okazji. Najlepsze: Terry Pratchett 13,3 (20 okazji, 56% wszystkich), Legion 10,0, Margaret Weis 8,0, Salvatore 5,6. Rozrzut wśród niezerowych 12,7x (wszystko: 82,5x, ale to szum małych prób, np. Harry Potter 15 okazji z 10 żądań w pierwszym wczytaniu). Nowe oferty na żądanie: górny kwartyl 0,38, dolny 0,00.

**Inne źródła**: 123 822 żądań (powtórki) dały 770 nowych i 21 okazji (0,02 na 100 żądań: ok. 100x gorzej niż Vinted). Liczba żądań jest zawyżona, bo sklepy czytane po kategoriach (BlackBooks, Kultura Wraca, Stara Dobra Książka) czytają całą kategorię przy każdej frazie przebiegu; wydajność „na frazę” dla nich nie ma sensu, liczy się wydajność źródła. Okazje poza Vinted: Allegro Lokalnie 17, Vanaheim 13, Tezeusz 11 (Vanaheim i Lagano to jednorazowy przebieg 20.11).

**Cele snajpera** (`sniperTargets`, dziś 40 fraz, np. „Mort Pratchett”, „Onyx Storm”): tylko 8 z nich ma w ogóle historię na Vinted (60 żądań z 1283). W powtórkach 0 okazji (rangi 18-48 z 67, czyli dolna połowa); w pełnych danych 5,0 wobec 6,64 dla reszty. Czyli obecne cele nie są lepsze od dolnej połowy, a frazy o najwyższej wydajności (autor/seria: Pratchett, Weis, Salvatore, Knaak, Golden) to frazy z listy uniwersów, nie cele z obrotu.

Zastrzeżenia: obciążenie ucięciem odczytu sprzed 68a33a5 (szerokie frazy gubiły oferty powyżej 960; w danych Salvatore 9 stron, Pratchett wiele) zaniża nowe oferty i okazje szerokich fraz, więc ich wydajność jest raczej niedoszacowana; okazje liczone na dziś (te, które zniknęły, nie liczą się); 36 okazji to mała próba; cele snajpera są słabo zmierzone (mało żądań).

**Werdykt wg kryterium:** rozrzut >= 10x jest (12,7x przy niezerowych, 58 z 67 zerowych), a cele snajpera nie dają więcej okazji niż dolna połowa => przesunąć budżet, ale dowód jest cienki (36 okazji, 56% z jednej frazy). Najtańszy następny krok: człon wydajności w kolejności `sniperTargets` (np. okazje z ostatnich 14 dni / żądania z `scan_runs` na frazę, z wygładzeniem wobec małych prób i stałym ułamkiem budżetu na eksplorację dla celów bez historii) oraz ostrzejszy próg 2 slotów uniwersów w partii; potem powtórzyć pomiar po tygodniu pracy snajpera na świeżych danych.

**Wdrożenie (najtańszy krok):** `phrase-yield.mjs` + `SNIPER_YIELD_SLOTS = 2` w `sniperTick` (kursor `yieldCursor`, zachowany przy nieudanym przebiegu). Źródło: żądania Vinted z `scan_runs.summary_json`, okazje z `listDeals` połączone przez `offer_queries` (oferty pierwszy raz widziane w oknie 14 dni, ułamki przy wielu frazach); bez nowej tabeli, jeden przebieg po danych (532 ms na kopii). Wygładzenie (okazje + 1) / (żądania + 50), tylko frazy z >= 1 okazją, pula 6. Ograniczenie: pierwsze wczytanie frazy zawyża wynik (Harry Potter 15/10); okazje liczone na dziś. Do powtórzenia pomiaru po tygodniu.

**Poprawka (stock a flow):** `yieldTargets` pomija pierwszy w historii przebieg frazy (jej żądania i oferty zobaczone w nim po raz pierwszy), bo ten przebieg mierzy zapas, nie napływ. Wybór 6 fraz na kopii: przed Harry Potter (15/10), Terry Pratchett, Legion, Ucieczka Eisensteina, Fourth Wing, Margaret Weis; po Terry Pratchett (20/150), Fourth Wing, Margaret Weis, Salvatore, Iron Flame, Legion.

## Okazje pewne i do sprawdzenia (wieczór nr 9)

Kopia `data/bookflip-catalog.sqlite` (kopia robocza w scratchpad, usunięta po pomiarze), `listDeals` bez zmian, 207 okazji (okazji z celu „Kupuję do” w kopii 0). „Uniwersum” = tytuł oferty pasuje do `seriesUniverses()` (jak w nr 14). n = `sold + live` z wyceny (obserwacje po odrzuceniu odstających).

| Grupa            | Okazje | n = 2 / 3 / 4 / 5 / 6 / 7 / 8+ | Pewność low / medium / high | n ≤ 3        | Z potwierdzoną sprzedażą | Low bez sprzedaży |
| ---------------- | ------ | ------------------------------ | --------------------------- | ------------ | ------------------------ | ----------------- |
| Wszystkie        | 207    | 50 / 35 / 15 / 22 / 17 / 10 / 58 | 119 / 82 / 6              | 85 (**41%**) | 61                       | 108               |
| Uniwersa         | 61     | 12 / 9 / 7 / 10 / 3 / 2 / 18   | 29 / 32 / 0                 | 21 (**34%**) | 21                       | 26                |
| Poza uniwersami  | 146    | 38 / 26 / 8 / 12 / 14 / 8 / 40 | 90 / 50 / 6                 | 64 (44%)     | 40                       | 82                |

**Co UI już ma (nie duplikować):** `app/views/deals.js` ukrywa okazje o pewności „low” domyślnie (`visibleDeals`, `includeLow`; pole `#dealsIncludeLow`, w liczniku „N ukrytych (niska wiarygodność wyceny)”). Każdy wiersz ma plakietkę `value-confidence is-low/medium/high` z liczbą sprzedaży i ofert oraz zakres „warta ~X (low–high)”. Jest też „Tylko najtańsze w wydaniu” (`cheapestLive`, hipoteza nr 10). Czyli filtr „tylko wiarygodne wyceny” nie ma sensu dodawać: domyślny widok już je stosuje. Przy domyślnym filtrze zostaje 88 okazji (medium/high), z których tylko 6 ma n ≤ 3 (pewność medium bywa przy n ≤ 3 tylko z potwierdzoną sprzedażą).

**Zgodność z backtestem:** bez potwierdzonej sprzedaży tylko 31% wycen mieści się w pasie 0,8–1,2 (59% ze sprzedażą). Wśród okazji 146 z 207 nie ma sprzedaży, a 108 z nich ma pewność low, czyli ukrytą domyślnie.

**Werdykt:** kryterium (>= 50% okazji uniwersów ma n ≤ 3) **nie spełnione**: 34% (21 z 61); wszystkie okazje 41%. Rozdzielenie list „pewna / do sprawdzenia” nie jest uzasadnione liczbą obserwacji, a rolę „do sprawdzenia” już pełni ukryta grupa „low” z przełącznikiem. Uwaga: n ≤ 3 i pewność low to nie to samo (low zdarza się także przy n ≥ 4 bez sprzedaży, szeroki rozstęp), więc rozstrzygające byłoby miara „pewność low bez sprzedaży”: 26 z 61 w uniwersach (43%), też poniżej 50%.

**Najtańszy następny krok (bez nowego filtra):** dla okazji pokazywanych po zaznaczeniu „pokaż niską wiarygodność” zamiast jednej liczby „warta ~X” pokazać zakres min–max żywych ofert tego wydania (dane `livePrices` już są w `listDeals`) z etykietą „do sprawdzenia” i przyciskiem „Kupuję do…” w wierszu (istniejący `price-targets.mjs`). Zmiana tylko wyświetlania w `dealMarkup`, bez zmiany wyceny, rankingu i alertów. Ma to sens głównie dla 62 okazji z n ≤ 3 i flagą „najtańsza” (cena poniżej każdej innej oferty) — to realny sygnał mimo słabej wyceny.

Czego nie sprawdzono: trafności okazji w czasie (brak werdyktów `deal_verdicts` do porównania z pewnością), „uniwersum” rozpoznane po tytule oferty (regex), n po odrzuceniu odstających.

## Napływ ofert w ciągu doby (wieczór nr 7)

Pomiar na kopii `data/bookflip-catalog.sqlite` (usunięta po pomiarze), czas Europe/Warsaw, bez sieci i bez zmian kodu.

**Adaptacja już istnieje.** `inflow-profile.mjs` + tryb `adaptive` sniper'a (`scan-schedule.mjs`) liczą 168 interwałów (dzień tygodnia × godzina) w zakresie 15–60 min, przy budżecie żądań nie większym niż stały interwał. Domyślnie jest **wyłączony** (`adaptive: saved.adaptive === true`), włącza go właściciel w „Okazjach”. Profil liczy się z `first_seen_at` dzielonego przez liczbę godzin faktycznie skanowanych, więc nie powiela pory skanowania właściciela.

**Dane o godzinie wystawienia są bardzo rzadkie.** `listed_at` ma 4231 z 6668 ofert Vinted, ale 99% to „2 mies.”, „roku”… (data = first_seen minus tekst, rozdzielczość dni i więcej). Rozdzielczość godzinową dają tylko teksty „N godz.” / „N min.”: **280 ofert** z 11 dni (10-21.11), w tym **8 okazji**. Skan (scan_runs, 4 tyg.) odbywał się prawie wyłącznie 19-24 (po 5-7 na godzinę) i kilka razy rano, więc próbka jest obciążona porą skanowania: oferty z nocy 0-6 widać tylko ze skanów rano.

| Godziny (Warszawa) | 0-5 | 6-10 | 11-15 | 16-20 | 21-23 |
|---|---|---|---|---|---|
| oferty (n=280) | 3 | 44 | 109 | 92 | 32 |

- 8 najlepszych godzin (nie ciągłych) = **62,1%** napływu, najlepsze 8 godzin ciągłych (11-18) = **59,6%**; godziny 0-6 to 3,9%. Kryterium „>= 60% w <= 8 h” jest więc na granicy (spełnione tylko dla 8 dowolnych godzin).
- Dni tygodnia: sob 66, pt 50, śr 48, czw 33, wt 32, ndz 30, pon 21 (słaba próba).
- Okazje (n=8): 7 z 8 w piątek, 6 z 8 w godz. 13-19; za mało na wniosek.

**Co dałby profil na tym rozkładzie (symulacja `sniperIntervals`, jednakowy wzorzec każdego dnia):**

| Interwał bazowy | Żądań/dobę adaptacyjnie vs stały | Interwał w szczycie 11-21 | Średnie czekanie na nową ofertę (ważone napływem) |
|---|---|---|---|
| 15 min | 72,6 vs 96 | 15 | 8,1 vs 7,5 min |
| 20 min | 65,1 vs 72 | 15 | 9,0 vs 10 min |
| 30 min | 48 vs 48 | 15-30 | 12,7 vs 15 min |

Oszczędność żądań jest umiarkowana (10-24% przy bazie 15-20 min, ponieważ interwał nie schodzi poniżej 15 ani nie przekracza 60), czas reakcji w szczycie skraca się z 20 do 15 min (-25%), nie o połowę. Próg „>= 30% żądań albo -50% reakcji” **niespełniony**.

**Werdykt:** nie ma osobnego eksperymentu do zbudowania; mechanizm istnieje, a jego zysk (przy tej, obciążonej próbce) jest mały. Nie zmieniać domyślnego `adaptive` na podstawie 280 ofert z 11 dni. Najtańszy krok: właściciel włącza „adaptacyjny” w „Okazjach” przy bazie 30 min (tam zysk reakcji 15 -> 12,7 min przy tym samym budżecie jest największy względnie, a profil sam zostaje płaski, dopóki skanów jest za mało: <14 dni, <200 ofert, <50% godzin tygodnia pokrytych). Prawdziwy pomiar będzie możliwy dopiero, gdy sniper chodzi całą dobę przez ≥ 2 tygodnie (wtedy `listed_at` z tekstów godzinowych nie będzie obciążone porą skanowania); wtedy powtórzyć to zapytanie.
