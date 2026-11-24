# Pewność wyceny w „Okazjach” (2026-11-22)

Fakt (kopia danych): 209 okazji, 57% z wiarygodnością „niska”, 6 „wysokich”. Fakt z kodu: `market-valuation.mjs` daje „wysoką” tylko przy >= 3 świeżych sprzedażach i rozrzucie <= 1,6; „średnią” przy sprzedaży + >= 3 punktach i rozrzucie <= 2,2. Progi są ręczne. Hipoteza: nie były sprawdzone na danych.

## 1. Kalibracja progów backtestem (najtańsze)
Teza: progi pewności należy ustawić według faktycznego błędu wyceny, nie wyczucia.
Eksperyment: `valuation-backtest.mjs` na kopii `data/bookflip-catalog.sqlite`; błąd mediany |estimate/sprzedaż − 1| osobno dla high/medium/low i dla wariantów progów (np. rozrzut <= 2,0 dla wysokiej, 2 sprzedaże zamiast 3). Dodatkowo `deal_verdicts` według pewności. Zmiana: tylko stałe i test. Ryzyko: „fałszywa pewność”, jeśli błąd niskich okaże się mały, to samo awansuje ich ranking.

## 2. Dobór próbek pod słabe okazje (celowany skan)
Teza: okazje o niskiej pewności dostają 2–4 dodatkowe punkty ceny przez zwykły skan, więc awansują.
Eksperyment: wybierz 20 dzieł z okazją „niska”, puść je przez istniejący endpoint skanu (przez bramę), zmierz ile przeszło do „średniej”. Zmiana: tryb „dowiedz się więcej” w sniperze (`scan-schedule.mjs`) obok trybu najnowszych. Ryzyko: obciążenie limitów źródła.

## 3. Pożyczanie z innych wydań tego samego dzieła
Teza: cena polskich wydań tego samego dzieła (po ISBN/dziele, nie po tytule) jest słabszym, ale realnym dowodem; oznaczone „z innych wydań”, waga niska.
Eksperyment: na kopii policz, ile okazji „niska” ma w dziele >= 3 sprzedaże innych wydań i czy backtest to potwierdza (błąd względem właściwego wydania). Zmiana: wejście w `market-valuation.mjs`, nowa przyczyna w `reasons`. Ryzyko: różne wydania mają różne ceny (twarda/miękka okładka).

## Rekomendacja: wdrożyć nr 1
Pliki: `valuation-backtest.mjs` (raport per pewność i wariant progów), `market-valuation.mjs` (progi), `test/valuation-backtest.test.mjs`, `test/` wyceny, `CHANGELOG.md`.
Kryteria: (a) raport podaje medianę błędu i liczbę przypadków per pewność; (b) nowe progi dają wyższą pewność tylko tam, gdzie mediana błędu <= 15% i n >= 30; (c) udział „wysokiej” rośnie ponad 6 okazji bez wzrostu błędu tej grupy; (d) `npm run verify` przechodzi.
Zapytać: valuation/deals tester o ocenę progów; właściciel nie musi decydować.

## Wynik pomiaru pomysłu 3 (2026-11-22, kopia danych, tylko odczyt)
Pożyczka: sprzedaże innych polskich wydań (język polski lub brak, bez „nieznanego wydania”, bez nowych ze sklepów) tego samego dzieła, >= 3 sprzedaże, wycena przez `estimateValue`.
- Zasięg: z 209 okazji 120 ma pewność „niska”/„brak”; tylko 6 z nich miałoby >= 3 sprzedaże z innych wydań.
- Backtest (sprzedaż wydania vs wycena z wcześniejszych sprzedaży innych wydań dzieła): n = 29 (23 dzieła), mediana ceny/wyceny 0,92, mediana błędu bezwzględnego 33%.
- Kryterium (błąd <= 25% przy n >= 15) niespełnione, a zasięg znikomy (6 z 120). Decyzja: nie wdrażać; nic w kodzie nie zmieniono. Ponowić, gdy przybędzie sprzedaży.
