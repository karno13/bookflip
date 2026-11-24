# Sesja kreatywna (2026-11-22): rzadkość, stan, literówki i inne luki

Status: **pomysły i hipotezy, nic niewdrożone, żadnych pomiarów nie wykonano** (w tej sesji nie było dostępu do uruchamiania kodu, więc eksperymenty poniżej są zaprojektowane, nie policzone). Nie powtarzam pomysłów z `zrodla-2026-11-22.md`, `2026-11-21-sesja-kreatywna-innovator.md`, `mapa-drogowa-*.md`, `wycena-pewnosc.md`. Priorytet właściciela: Warhammer, Dragonlance, Warcraft.

Fakt z kodu (`market-index.mjs`, `sniperTargets`): snajper obserwuje dzieła, których najlepsze wydanie ma wycenę **średnią lub wysoką** i **co najmniej 25 zł**, posortowane **po obrocie** (30-dniowej szansie sprzedaży). Z pomiarów (`2026-11-22-pomiary-na-kopii.md` i `zrodla-2026-11-22.md`): wycena bez potwierdzonej sprzedaży trafia w pas 0,8–1,2 w 31% przypadków; dostępna oferta Dragonlance to 1 (angielska).

## Pomysły (dywergencja)

1. **Snajper kieruje się obrotem, a priorytet właściciela to rzadkość.** Teza: rzadkie, stare wydania (Dragonlance z lat 90., wyczerpane Warhammery Magu/Fabryki Słów) mają z definicji niski obrót i niską pewność wyceny, więc obecne kryterium wyboru fraz **systemowo ich nie obserwuje**. Rozwiązanie: „lista przypięta” właściciela (zawsze skanowana, rzadko) plus punktacja rzadkości zamiast obrotu dla przypiętych. Inspiracja: giełdy — instrumenty o niskiej płynności wymagają stałej obserwacji zlecenia, nie częstego handlu. Eksperyment: zob. „Trzy najlepsze” nr 1. Zmiana: dodatkowe źródło celów w `sniperTargets` (lub etykieta/cel „Kupuję do” jako przypięcie).
2. **Korekta wyceny o stan egzemplarza.** Teza: mediana wydania miesza egzemplarze „jak nowe” i „zniszczone”; część „okazji” to po prostu słabszy stan. Inspiracja: karty kolekcjonerskie (NM/LP/MP/HP mają osobne ceny), rynek aut (przebieg). Zob. nr 2 w trzech najlepszych.
3. **Powrót rzadkości jako zdarzenie.** Teza: pierwsza oferta wydania po długiej nieobecności na rynku (np. 60+ dni bez żadnej dostępnej) jest sygnałem silniejszym niż niska cena; takie oferty znikają szybciej. Inspiracja: „population report” i alerty o pojawieniu się karty w obrocie, płytkie księgi zleceń. Zob. nr 3.
4. **Literówki i warianty tytułu (fat-finger).** Teza: oferty z błędem w tytule („Dragonlanse”, „Kroniki Dragonlance” bez polskich znaków, odwrócony szyk „Zmierzchu Smoki Jesiennego”) nie wychodzą w wyszukiwarce na frazę poprawną, więc mają mniej kupujących i bywają tańsze. Inspiracja: narzędzia do wyszukiwania literówek na eBay (Fatfingers). Eksperyment: w kopii znaleźć oferty rozpoznane przez ISBN, których tytuł nie zawiera poprawnej nazwy dzieła (odległość edycyjna 1–3) i porównać stosunek cena/wycena z resztą. Jeśli niższy, dopisać generator wariantów do fraz snajpera (ASCII bez ogonków, brak spacji, typowe literówki). Zmiana: generowanie wariantów w frazach, żadnych nowych źródeł.
5. **Koszyk u jednego sprzedawcy (wysyłka dzielona).** Teza: dwie okazje u tego samego sprzedawcy to jedna przesyłka; przy tanich książkach to większy ruch w opłacalności niż sama różnica do wyceny. Fakt: `vinted_detail_cache.shipping_cost` istnieje; wcześniejszy pomiar pokazał, że sprzedawcy z ≥3 ofertami nie są tańsi — więc wartość leży w wysyłce, nie w cenie. Eksperyment: z listy 202 okazji policzyć sprzedawców z ≥2 okazjami i ile z nich ma zapisany koszt wysyłki. Zmiana: odznaka „druga okazja u tego sprzedawcy” w „Okazjach” (bez kwot zysku; granica z odłożonymi kosztami — **wymaga decyzji właściciela**, jeśli pokaże kwotę wysyłki).
6. **Przelistowanie jako sygnał gotowości do negocjacji.** Fakt: tabela `offer_relists` (ten sam sprzedawca, ta sama pozycja). Hipoteza: sprzedawca, który wystawia ofertę ponownie, nie sprzedał jej za pierwszym razem i chętniej schodzi z ceny. Eksperyment: porównać odsetek obniżek i stosunek cena/wycena ofert z relistem i bez.
7. **Premia nad ceną nowego jako wskaźnik wyczerpania nakładu.** Teza: gdy wycena używanego z Vinted przekracza cenę nowego w sklepie (Empik/BN/Copernicus), nakład jest wyczerpany lub wydanie jest poszukiwane; to sygnał priorytetu zakupu, a nie błąd wyceny. Odwrotnie: wycena znacznie powyżej nowego bez dowodu wyczerpania to prawdopodobny artefakt. Inspiracja: rynek wina i druków (cena aukcyjna / cena premierowa). Eksperyment: dla wydań z cenami Empika policzyć stosunek wycena/cena nowego i sprawdzić, jak wygląda rozkład oraz czy wysokie wartości dotyczą wydań wyczerpanych.
8. **Własne sprzedaże jako jedyna prawdziwa prawda o cenie.** Teza: wszystkie wyceny opierają się na cenach wywoławczych; jedyny punkt transakcyjny to sprzedaże właściciela. Rejestr zapasu ma daty bez kwot (decyzja zespołu z 21.11), więc ta wiedza nigdy nie wróci do wycen. Pomysł: opcjonalna kwota „sprzedane za” tylko do kalibracji wyceny (nie do zysku). **Wymaga decyzji właściciela** (zmiana „bez kwot”). Eksperyment: brak danych (zapas 0 sztuk); najpierw zapytać, czy właściciel będzie sprzedawał.
9. **Rozstęp cen między wydaniami tego samego dzieła jako wartość rozstrzygnięcia.** Teza: gdy wydania jednego dzieła różnią się cenowo 3×, oferta bez ISBN daje „loterię” (okładka rozstrzyga, czy to 20 czy 60 zł); takie dzieła to najlepsze cele podpowiedzi z okładki, a oferty bez ISBN w dziełach o małym rozstępie można ignorować. Eksperyment: rozstęp mediany cen wydań dla dzieł z ≥2 wycenionymi wydaniami; zestawić z liczbą ofert bez ISBN. To priorytetyzuje pracę, nie dodaje źródła.
10. **Dwuwarstwowy snajper: tani „tętniak” + głęboki odczyt.** Teza: 37% ofert Vinted nie ma czasu wystawienia, bo nie pobrano szczegółów; zamiast pobierać wszystkie, pobierać szczegóły tylko dla ofert, które przeszły wstępny filtr „cena < 0,8 wyceny”. Mniej żądań przez bramkę, więcej pewnych okazji. Inspiracja: lejek w handlu algorytmicznym (tani filtr, drogie potwierdzenie).
11. **Lista ISBN uniwersów jako rdzeń skanu (rozwinięcie wniosku z `zrodla` nr 3).** Dziś Zysk ma 16 pozycji Dragonlance, niedostępnych w sklepie, ale to gotowa lista ISBN-ów do bazy „pilnuj tych”. Po jej wprowadzeniu snajper pytałby Vinted frazą z tytułu i autora dopasowaną do ISBN-ów, a nie ogólną. Eksperyment: ile z 16 ISBN-ów jest w katalogu i ile ma jakąkolwiek ofertę w historii.
12. **Rankingi „okazji, które nie są okazjami”.** Przeciwieństwo okazji: oferty powyżej wyceny, które wiszą i spadają; to źródło pomiarów negocjacji (zob. `mapa-drogowa-4` nr 4), ale też **lista „nie kupuj teraz, poczekaj na obniżkę”** dla książek, które właściciel ma na celu. Pomiar: odsetek ofert, które w ciągu 14 dni obniżyły cenę o ≥10% (z poprzednich pomiarów: 6,6% starszych niż 14 dni; mało).
13. **Dzień tygodnia wystawiania a cena (sezonowość mikro).** Hipoteza: niedzielne wieczorne wystawienia są od początku tańsze (porządki weekendowe, nowi sprzedawcy). Eksperyment: stosunek cena/wycena według dnia i godziny z czasu wystawienia (4231 ofert). Wnioski wpiąć w profil snajpera (`inflow-profile.mjs` już liczy napływ; brakuje ceny).
14. **Cena sprzedaży według liczby zdjęć i długości opisu (jakość oferty jako proxy niewiedzy).** Oferty z krótkim tytułem „Książka” i jednym zdjęciem są wystawiane przez sprzedających, którzy nie sprawdzili ceny. Eksperyment: korelacja stosunku cena/wycena z długością tytułu i obecnością opisu w `offer_raw_snapshots`. Jeśli sygnał jest silny, dodać do rankingu okazji jako czynnik pewności „sprzedawca nie zna wartości”.

## Ocena (wartość / trudność / ryzyko)

| # | Pomysł | Wartość | Trudność | Ryzyko |
|---|---|---|---|---|
| 1 | Lista przypięta / rzadkość w snajperze | wysoka (trafia w priorytet) | niska | niskie |
| 2 | Korekta o stan | wysoka | średnia | średnie (słowa stanu w opisach rzadkie) |
| 3 | Powrót rzadkości | wysoka | niska | niskie |
| 4 | Literówki i warianty | średnia–wysoka | niska | niskie |
| 5 | Koszyk u sprzedawcy | średnia | niska | niskie (decyzja o kwotach) |
| 6 | Relist | niska–średnia | niska | niskie |
| 7 | Premia nad ceną nowego | średnia | niska | niskie |
| 8 | Kwota sprzedaży do kalibracji | wysoka długoterminowo | niska | niskie (decyzja właściciela) |
| 9 | Rozstęp cen wydań | średnia | niska | niskie |
| 10 | Dwuwarstwowy snajper | średnia | średnia | niskie |
| 11 | Lista ISBN uniwersów | wysoka | średnia | niskie |
| 12 | Poczekaj na obniżkę | niska | niska | niskie |
| 13 | Dzień tygodnia a cena | niska–średnia | niska | niskie |
| 14 | Jakość oferty jako sygnał | średnia | niska | średnie (korelacja, nie przyczyna) |

## Trzy najlepsze

### 1. Snajper przypięty do priorytetów właściciela (nr 1, z elementami nr 11)

- **Fakt:** kryterium `sniperTargets`: obrót, wycena ≥ średnia, ≥ 25 zł. **Hipoteza:** rzadkie tytuły uniwersów (zwłaszcza Dragonlance) nie przechodzą tego filtra.
- **Pierwszy tani eksperyment (tylko odczyt, kopia `data/bookflip-catalog.sqlite`):** wywołać `sniperTargets(repository, { limit: 200 })` i policzyć, ile spośród dzieł pasujących do wzorca uniwersów (Warhammer, Dragonlance, Warcraft; ten sam regex co w pomiarze #2 w `zrodla-2026-11-22.md`) w ogóle trafia na listę; porównać z liczbą dzieł uniwersów w katalogu i ich ofert w historii.
- **Kryterium sukcesu:** poniżej 50% dzieł uniwersów, które miały jakąkolwiek ofertę w ostatnich 90 dniach, jest na liście celów snajpera, a wśród pominiętych są dzieła z ofertami ≤ 0,8 wyceny. Wtedy zmiana ma wymierną lukę do zamknięcia. Jeśli pokrycie jest wysokie, pomysł do odrzucenia.
- **Ryzyka:** dołożenie frazy zwiększa liczbę żądań do Vinted (limit partii `SNIPER_BATCH` = 10, bramka zostaje); niska pewność wyceny rzadkich tytułów to więcej fałszywych okazji (pokazywać z oznaczeniem pewności).

### 2. Korekta wyceny o stan egzemplarza (nr 2)

- **Hipoteza:** słowa stanu w tytule/opisie (np. „nowa”, „jak nowa”, „nieczytana”, „zniszczona”, „pożółkła”, „ślady użytkowania”, „bez okładki”) wyjaśniają dużą część rozrzutu stosunku cena/wycena (obecnie w pasie 0,8–1,2 jest tylko 41% prób).
- **Pierwszy tani eksperyment:** na kopii, tylko odczyt: z `original_title` oraz `offer_raw_snapshots.payload` (typ `detail`) wyciągnąć kilkanaście słów stanu dwoma regexami (pozytywne/negatywne), pogrupować oferty rozpoznane ISBN i policzyć medianę cena/wycena w trzech grupach (dobry stan / brak informacji / zły stan) oraz odsetek ofert z jakąkolwiek informacją.
- **Kryterium sukcesu:** informacja o stanie jest w ≥ 20% ofert, a różnica mediany między „dobrym” a „złym” stanem ≥ 25% w obrębie tego samego przedziału wyceny. Jeśli tak, następnym krokiem jest flaga „zły stan, to nie okazja” i mnożnik wyceny w rankingu.
- **Ryzyka:** opisy bywają niepełne (stan tylko na zdjęciu); negacje („bez śladów zniszczenia”) mylą regex, więc pierwszy test ma tylko zmierzyć, czy sygnał istnieje; nie wolno dopisywać stanu do dowodu ISBN.

### 3. Powrót rzadkości (nr 3, wspólnie z nr 7 jako wskaźnikiem wyczerpania nakładu)

- **Hipoteza:** oferty wydań, które wcześniej przez 60+ dni nie miały żadnej dostępnej oferty, znikają szybciej niż pozostałe i częściej są tańsze od wyceny.
- **Pierwszy tani eksperyment:** na kopii, tylko odczyt: dla każdego wydania zbudować oś czasu dostępności ofert (z `first_seen_at`, `last_seen_at`, `availability`); wyróżnić oferty, które pojawiły się po przerwie ≥ 60 dni; dla nich i dla reszty policzyć medianę dni do zniknięcia i medianę cena/wycena. Dodatkowo policzyć, ilu z nich dotyczy dzieł uniwersów.
- **Kryterium sukcesu:** co najmniej 30 takich „powrotów” w kopii, mediana czasu do zniknięcia krótsza o ≥ 30% niż w grupie porównawczej. Przy mniejszej próbie wynik jest tylko wskazówką (snajper działa od niedawna, historia dostępności jest krótka).
- **Ryzyka:** „zniknięcie = sprzedaż” to znane założenie (może to być wycofanie); przerwy w obserwacji (brak skanu) udają nieobecność oferty, więc trzeba wyłączyć okresy bez skanu danej frazy.

## Założenia, które kwestionuję

1. **„Snajper powinien skanować to, co najlepiej się obraca.”** Dla kogoś, kto polluje rzadkość (Dragonlance), to odwrócenie priorytetu; obrót mierzy, ile kupujących, a nie ile premii za cierpliwość.
2. **„Wycena na wydanie to mediana ofert.”** Mediana nie rozróżnia stanu, a okazje wychodzące z rozrzutu mogą być po prostu gorszym egzemplarzem.
3. **„Rejestr zapasu bez kwot jest bezpieczny.”** Jest bezpieczny dla zakresu produktu, ale odcina wyceny od jedynych danych transakcyjnych. Do decyzji właściciela, nie do ustępstwa z góry.
4. **„Okazja to oferta poniżej wyceny.”** Okazją bywa też oferta o normalnej cenie, ale w nietypowym momencie (powrót po przerwie, relist, literówka); zdarzenie często jest lepszym sygnałem niż odchylenie ceny.
5. **„Frazy poprawnej pisowni wystarczą.”** Zob. nr 4; nie zmierzone.

## Kogo zapytać

- **scanner-specialist:** o koszt dodania listy przypiętej do `sniperTargets` i o wpływ na budżet żądań; o generator wariantów (nr 4).
- **catalog-specialist:** czy oś czasu dostępności wydań (nr 3) jest wiarygodna mimo przerw w skanie; czy `offer_raw_snapshots` ma opisy w dostatecznej liczbie (nr 2).
- **data/market:** uruchomić trzy eksperymenty na kopii (żadnego nie uruchomiono w tej sesji).
- **product-triage:** nr 8 (kwoty sprzedaży) wymaga wpisu w „Settled”, jeśli właściciel się zgodzi.

## Co wymaga decyzji właściciela

- Nr 5 (jeśli odznaka ma pokazywać kwotę wysyłki) i nr 8 (kwota „sprzedane za”): obie ocierają się o „bez kwot i kosztów”.
- Pozostałe mieszczą się w obecnym kierunku (skaner, katalog, okazje bez zysku).
