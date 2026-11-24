# „Dziś” jako plan dnia, rozstrzygnięcie „nisza vs szeroki rynek” i 5 nowych pomysłów (2026-11-21)

Druga sesja kreatywna. Fakty: odczyty z `today.mjs`, `catalog-measures.mjs`, `data-health.mjs`, `deal-forecasts.mjs`, `market-index.mjs`, `review-queue.mjs`, `docs/SCHEMA.sql`. Reszta to hipotezy; nic nie zostało uruchomione na danych właściciela.

## 1. „Dziś” jako plan dnia

Teza: dziś `/api/today` mówi „co się zmieniło”; plan dnia ma mówić „co zrobić w najbliższych 10 minutach i czy dane są wiarygodne”. Karty to kolejność działania, nie statystyk. Karta ukrywa się, gdy nie ma w niej nic do zrobienia (pusty dzień = jedno zdanie „nic pilnego”).

### Karty (kolejność = kolejność pracy)

| # | Karta | Dane już liczone | Czego brakuje |
|---|-------|------------------|---------------|
| 1 | Czy mogę ufać dzisiejszym liczbom? | `lastScan.failedSources`, `nextScan`, `dataHealth().suspectedDrop`, `withoutPrice` | spięcie `dataHealth` z `/api/today` (dziś osobny odczyt); pasek pojawia się tylko przy problemie |
| 2 | Okazje do ruszenia teraz | `deals.mjs` (oszczędność × szansa), `deal-alerts` (ogłoszone, jeszcze nieobejrzane) | znacznik „obejrzane” / czas ogłoszenia; maks. 3 pozycje + link „wszystkie” |
| 3 | Nowe od ostatniej wizyty | `newOffers`, `priceChanges` (z filtrami listy) | pojedyncza liczba „z tego w obserwowanych dziełach” |
| 4 | Decyzje, które odblokowują najwięcej | `reviewQueueSummary`, `oldestDecisionDays` | „wartość odblokowana”: ile ofert i ile zł wyceny wchodzi do okazji po rozstrzygnięciu (nowy odczyt, tylko SELECT) |
| 5 | Szybkie rynki bez podaży | `marketIndex` (turnover, `liquidity.live`), `sniperTargets` | lista edycji o wysokim `turnover` i `live = 0`: „czego dziś nie ma, a schodzi”; to wejście do ręcznego szukania |
| 6 | Fraza dająca szum | `scan_runs.summary_json` (zapytania), historia okazji | liczba nowych ofert i okazji na frazę w 14 dni; propozycja wyłączenia (cofalna, jak „automatyczna decyzja”) |
| 7 | Czy ranking się sprawdza | `dealForecasts` (Brier vs `baselineBrier`, różnica do kontroli) | pokazywać dopiero od ok. 30 rozliczonych okazji; do tego czasu „za mało danych” zamiast liczby |
| 8 | Miary katalogu | `todayMeasures` (4 miary z trendem) | nic; zwinięta na dole, bo nie wymaga działania |

Kolejność: zaufanie → pieniądze → szybka praca → nauka systemu. Karta 1 jest pierwsza, bo błędne dane unieważniają karty 2–5 (cicha zmiana układu Vinted).

### Makieta słowna
```
Dziś, sobota 21.11
[!] Vinted: 61% mniej nowych ofert niż tydzień temu (komputer był wyłączony od wt.?) → sprawdź skany
OKAZJE (3 z 11)
  „Imię wiatru” Rothfuss  29 zł   wycena 52 zł   szansa 31%   oczekiwany zysk 7 zł   ogłoszona 2 h temu   [Otwórz]
  ...                                                                                   [Wszystkie okazje]
NOWE od czwartku: 214 ofert, 38 zmian cen (z tego 9 w dziełach z listy)   [Pokaż]
DECYZJE: 20 decyzji odblokowuje 140 z 410 ofert (~2 300 zł wyceny)  [Zacznij: ok. 6 min]   [Cała kolejka: 87]
NIE MA NA RYNKU, A SCHODZI: „Wiedźmin: Miecz przeznaczenia” (szansa 34%, 0 ofert)   [Szukaj]
SZUM: fraza „metro” 9 nowych ofert, 0 okazji w 14 dni   [Wyłącz]
PROGNOZY: 18 rozliczonych okazji; za mało danych
Miary: rozpoznanie 78% (+1,2) · najstarsza decyzja 9 dni · kompletne wydania 91%
```

### Jak właściciel mierzy oszczędność czasu
Lokalna tabela zdarzeń widoku (bez wysyłania gdziekolwiek; zdarzenia z istniejącego dziennika `app-runtime`). Cztery liczby, tydzień do tygodnia:
1. **Czas do pierwszej użytecznej czynności**: od otwarcia aplikacji do pierwszego otwarcia oferty z okazji albo zapisanej decyzji. Cel: spadek względem tygodnia przed wdrożeniem.
2. **Przełączenia kart przed pierwszą czynnością** (mniej = plan dnia wystarcza).
3. **Decyzje na minutę** w kolejce i odsetek ofert odblokowanych na 10 decyzji (czy sortowanie po wartości działa).
4. **Okazje „ogłoszone → obejrzane” w czasie** (mediana minut); do tego odsetek okazji, których oferta zniknęła, zanim ją otwarto (koszt spóźnienia).

Uczciwy pomiar: najpierw 2 tygodnie samego logowania na obecnym UI (baseline), potem plan dnia; nie porównywać ze „wrażeniem”. Pułapki z QA: „odrzuć” niczego nie odblokowuje (liczyć osobno); kolejność deterministyczna; link „cała kolejka” zawsze widoczny; ręczne przypisania wypadają z planu.

Pierwszy tani krok: skrypt tylko do odczytu na kopii bazy, który liczy kartę 4 (ile ofert i zł wyceny odblokowuje top-20 decyzji) bez UI. Jeśli top-20 odblokowuje < 10% ofert, karta 4 nie jest warta budowy.

Do oceny: ui-ux-specialist (układ, ukrywanie pustych kart), qa-reviewer (definicja „odblokowania”, deterministyczność).

## 2. Nisza czy szeroki rynek: rozstrzygnięcie danymi

Teza: wybór rozstrzyga jedna miara, ustalona przed pomiarem: **oczekiwany obrót 30-dniowy na minutę pracy właściciela** w danym segmencie, po odjęciu tarcia (decyzje w kolejce, oferty bez ISBN). Samo „szansa sprzedaży” faworyzuje szeroki rynek, a samo „rozpoznanie” niszę; dopiero iloraz pokazuje, co się opłaca.

Segment = nisza (dzisiejsze frazy: fantastyka, uniwersa gier) albo „reszta”. Dla każdego mierzyć z istniejących odczytów:
- stopa sprzedaży na dzień oferty (`liquidityModel`) i mediana `turnover` na wydanie (`marketIndex`);
- podaż: ile żywych ofert na jedną sprzedaż (nasycenie);
- ile okazji tygodniowo (`deals`) i ich oczekiwany zysk;
- tarcie: odsetek ofert bez ISBN, odsetek rozpoznany automatycznie, decyzje w kolejce na 100 ofert;
- pewność wyceny (odsetek wydań o pewności średniej/wysokiej).

Główny problem: dane są skażone wyborem. Frazy skanu to niemal wyłącznie nisza, więc „reszta” jest w bazie przypadkowa. Dlatego:
1. **Krok 0 (offline, kopia):** podzielić istniejące 2,4 tys. ofert na „fraza niszowa” i resztę (np. według pochodzenia oferty z `scan_runs`/frazy); policzyć powyższe z przedziałami ufności. Jeśli reszta ma < 30 sprzedaży, wniosek brzmi „brak danych”, nie „nisza wygrywa”.
2. **Krok 1 (wymaga decyzji właściciela o budżecie zapytań):** dwutygodniowy skan próbny „najnowsze w kategorii książek” (odwrócony skan z poprzedniej sesji) przez normalną bramkę, w niewielkim budżecie, jako losowa próba szerokiego rynku. Nic nie omija limitów.
3. **Reguła decyzji zapisana z góry:** szeroki rynek tylko gdy obrót na minutę pracy ≥ 1,5× niszy i odsetek bez ISBN nie pogarsza go o więcej niż połowę; w przeciwnym razie nisza plus najlepsze „wyspy” z szerokiego rynku (autorzy/serie o wysokim `turnover`, bo wybór nie jest binarny).

Ostrzeżenia: „zniknięcie = sprzedaż” zawyża oba segmenty podobnie, więc porównanie względne jest bezpieczniejsze niż bezwzględne; wynik zależy od pory roku (listopad–grudzień to sezon prezentów), więc powtórzyć w styczniu lub oznaczyć jako sezonowy. Do oceny: product-triage (miara na minutę pracy), scanner-specialist (koszt próby w budżecie bramki), qa-reviewer (skażenie wyborem).

## 3. Pięć nowych pomysłów z innych branż

Ocena: wartość / trudność / ryzyko (W/T/R: N niska, Ś średnia, W wysoka).

### A. Okres półtrwania okazji (zarządzanie przychodami linii lotniczych: towar nietrwały)
Teza: okazje różnią się tym, jak długo żyją; alarm i miejsce w „Dziś” powinny zależeć od czasu do zniknięcia, nie tylko od zysku. Problem: ruch właściciela jest najdroższy, gdy okazja zniknie w 2 godziny. Inspiracja: bilety i hotele wyceniane wg tempa wyprzedaży. Eksperyment: na kopii bazy policzyć rozkład czasu od `first_seen_at` do `sold` dla ofert z `deal_alerts` wg przedziału oszczędności i ulubionych; jeśli mediana < 6 h dla górnej grupy, sniper musi skanować częściej tylko dla niej. Zmiana: kolumna czasu w rankingu, parametry zakresu snipera. W: Ś / T: N / R: N (cenzura obserwacji przy rzadkich skanach, więc podawać dolną granicę).

### B. Intensywność napływu ofert według godziny i dnia (planowanie zatrudnienia w call center)
Teza: nowe oferty pojawiają się nierówno; sniper powinien skanować gęściej w godzinach szczytu i rzadziej w nocy, przy tym samym łącznym budżecie zapytań. Problem: stały interwał 15–60 min marnuje budżet bramki. Eksperyment: mapa cieplna (dzień tygodnia × godzina) z `first_seen_at`, z korektą na interwał skanu; test, czy 8 godzin szczytu daje > 50% nowych okazji. Zmiana: harmonogram w `scan-schedule.mjs` (profil „adaptacyjny”, tylko plan, nie obchodzi limitów). W: Ś / T: N / R: N.

### C. Karta kontrolna zamiast stałego progu (statystyczna kontrola procesu, przemysł)
Teza: `DROP_RATIO = 0.5` jest sztywny; granice kontrolne ±3σ liczone z historii źródła wychwytują wolniejsze, cichsze degradacje (spadek ceny ISBN, wzrost „bez ceny”) i nie podnoszą fałszywych alarmów w tygodniach świątecznych. Eksperyment: dla ostatnich 12 tygodni policzyć tygodniowe liczby nowych ofert i odsetek bez ISBN na źródło i sprawdzić, które tygodnie złamałyby stary próg, a które nowy; zespół ocenia je ręcznie. Zmiana: `data-health.mjs` (nowe pole, stary próg zostaje). W: Ś / T: N / R: N (mała próba tygodni).

### D. Sygnał obniżki ceny (nieruchomości: „price reduced”)
Teza: sprzedawca, który obniżył cenę, bardziej chce sprzedać i częściej sprzedaje; to sygnał niezależny od oszczędności względem wyceny. Dane są już zebrane (`offer_price_history`, `priceChanges` w „Dziś”). Eksperyment: na kopii porównać odsetek sprzedaży w 14 dni po obniżce z ofertami bez obniżki o tej samej cenie względnej do wyceny. Jeśli różnica jest wyraźna, dodać „obniżono 2×” do karty 3 i jako czynnik rankingu (osobno od `market-index.mjs`, żeby nie mieszać przyczyn). W: Ś-W / T: N / R: Ś (obniżka koreluje z wiekiem oferty; kontrolować wiek).

### E. Sprzedawcy hurtowi (likwidacja spuścizny / lombard)
Teza: sprzedawca z wieloma książkami naraz zwykle opróżnia półkę i wycenia taniej oraz łatwiej negocjuje paczkę; widok „sprzedawcy z ≥ 5 ofertami z wyceną powyżej ceny” grupuje je w jedną wizytę. Fakt: tabela `offers` ma `seller_id` z indeksem; hipoteza: Vinted pokazuje identyfikator sprzedawcy na tyle stabilnie, by grupować. Eksperyment: zapytanie na kopii: ilu sprzedawców ma ≥ 5 ofert i jaka jest suma `wycena − cena` na sprzedawcę względem pojedynczych okazji. Zmiana: odczyt + karta w „Okazjach”. **Wymaga decyzji właściciela**, jeśli widok miałby służyć do kontaktu lub zakupu paczek (granica z handlem); sama lista oszczędności jest zgodna z kierunkiem. W: W / T: Ś / R: Ś (płaty „wizyty”, sprzedawca może usunąć oferty po pierwszym kontakcie, czego produkt nie mierzy).

## 4. Trzy najlepsze i pierwszy eksperyment
1. **Plan dnia, karta 4 (decyzje odblokowujące wartość)**: skrypt SELECT na kopii, czy top-20 odblokowuje ≥ 10% ofert.
2. **Nisza vs rynek, krok 0**: podział istniejących ofert na segmenty z przedziałami ufności; wynik „za mało danych” jest też wynikiem.
3. **D (obniżka ceny)** albo **A (półtrwanie)**: oba są czystym SELECT-em na kopii; D ma największą szansę dać nowy, niezależny sygnał rankingu bez nowych żądań.

## 5. Założenia, które kwestionuję
- „Dziś” jako lista zmian: wartość to kolejność działań, nie liczby; osiem miar na wejściu to szum.
- Stały próg `DROP_RATIO`: dane mają sezonowość, więc stały próg myli się w obu kierunkach.
- Kolejka decyzji liczona w sztukach: powinna być liczona w złotych odblokowanej wyceny i czasie.
- „Nisza vs rynek” jako wybór binarny: najpewniej odpowiedzią są wyspy wewnątrz szerokiego rynku.
- Dane niszy opisują rynek: są skażone frazami, które same ją wybierają.
- Interwał snipera 15–60 min jako stały: napływ ofert jest nierówny, więc budżet można rozłożyć lepiej bez żadnego nowego żądania.

## Kto ma ocenić
ui-ux-specialist (karty, makieta), product-triage (miara „obrót na minutę”, kolejność kart), qa-reviewer (skażenie wyborem, definicja zniknięcia), scanner-specialist (koszt próby szerokiego rynku w bramce, harmonogram B).
