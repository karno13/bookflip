# Changelog

Zmiany widoczne dla użytkownika. Wpisy są numerowane, najnowszy na górze; liczby pochodzą z danych użytkownika (kopia bazy), gdy są dostępne. Poprawki błędów zaczynają się od „**Błąd:**”.

## 2026-11-23 (260) — „Dziś”: karta „Snajper jest wyłączony” z przyciskiem

- Na kopii bazy snajper był wyłączony i ani razu nie uruchomiony, więc strumień, wyszukiwanie po ISBN i nowe frazy (wpisy 254–259) nic by nie robiły. Teraz „Plan dnia” na „Dziś” pokazuje kartę „Snajper jest wyłączony” z wyjaśnieniem, co daje, i przyciskiem „Włącz snajpera” (co 20 min, jak domyślnie w „Okazjach”); drugi przycisk otwiera ustawienia w „Okazjach”. Karta stoi na początku planu. Po włączeniu znika. Nic nie włącza się samo: decyzja jest Twoja. Sprawdzone w Edge na kopii bazy przy szerokości telefonu: karta widoczna, przycisk włącza snajpera, karta znika.
- Karty nie ma przy pustym katalogu ani gdy wszystkie dzieła są usunięte (snajper nie miałby czego pilnować). Gdy automatyczne skany są wyłączone dla całej aplikacji (`BOOKFLIP_SCHEDULED_SCANS=0`), przycisk zapisuje ustawienie, ale snajper i tak nie ruszy (wyjaśnia to panel w „Okazjach”).

## 2026-11-23 (259) — Strumień co 5 minut, osobno od partii snajpera

- Strumień (wpis 254) nie siedzi już w partii snajpera co 20 min, tylko ma własny rytm: przy włączonym snajperze co 5 minut czyta najnowsze ogłoszenia całej kategorii książek Vinted (do 3 stron), a gdy któreś wskazuje dzieło z katalogu, robi skan „najnowsze” tylko tych fraz (do 6). Gdy nic nie pasuje, skanu nie ma. Partia snajpera wróciła do dawnego składu (10 fraz z obrotu, niepewnych okazji, uniwersów, wydajności i ISBN).
- Po co: przy ok. 90 nowych ogłoszeniach na minutę 3 strony to ok. 3 minuty. Co 20 min strumień widział ok. 15% nowych ogłoszeń, co 5 min ok. 60%. Koszt: 1–3 żądania co 5 min plus skan tylko przy dopasowaniu (przy ok. 0,5% dopasowań zwykle 1–2 frazy), łącznie ok. 25–50 żądań na godzinę więcej do Vinted, przez tę samą bramkę i jej przerwy. Odmowa Vinted (403/429) kończy odczyt bez skanu; odczyt, który nie skończy się w 40 s, jest przerywany.
- Strumień nie bierze pod uwagę dzieł, których fraza to jedno słowo bez autora (na kopii bazy 10, np. „Fantasy”, „Pakiet”, „Codex”, „Joker”): w pierwszym przebiegu na żywo z dopasowaniem „Fantasy” zadziałało na zwykłe ogłoszenie. Te dzieła zostają w zwykłej rotacji snajpera. Pierwszy przebieg na żywo (kopia bazy, 23.11): 3 strony, 279 nowych ogłoszeń, skan „najnowsze” zakończony bez błędów.
- W panelu snajpera: „strumień (co 5 min): 287 nowych ogłoszeń książek, 1 z katalogu (…)”. Wyłączenie: `BOOKFLIP_SNIPER_STREAM=0` (snajper działa wtedy bez strumienia).
- Przy okazji (z przeglądu QA): wyjątek od filtra tytułu dla wyszukań po ISBN dotyczy tylko Vinted; frazy ISBN nie trafiają do miejsc „najlepsza wydajność” (mają własne miejsce); błąd liczenia listy okazji dla kolejności sprawdzeń nie jest zapamiętywany na godzinę.

## 2026-11-23 (258) — Frazy snajpera uczą się od ogłoszeń: „Durotan Warcraft” zamiast „Durotan Golden”

- Fraza dzieła o jednowyrazowym tytule dostaje nazwisko autora („Mort Pratchett”), ale sprzedawcy Warcrafta piszą uniwersum, nie autora („Warcraft Durotan”). Teraz, gdy dzieło ma uniwersum i co najmniej 5 ogłoszeń Vinted przypisanych po ISBN, aplikacja sprawdza na nich, czy „tytuł + uniwersum” obejmuje wyraźnie więcej (co najmniej 2 i 10% więcej) niż „tytuł + nazwisko”, i wtedy go używa: w snajperze i w strumieniu.
- Na kopii bazy zmieniły się 3 frazy: Durotan (ogłoszenia objęte frazą: 15 → 49 z 54), Illidan (21 → 35 z 44), Wędrowiec (3 → 5 z 6); wszystkie frazy razem 82% → 84% z 2100 ogłoszeń. Liczone ok. 30 ms. Pratchett i inne dzieła, których sprzedawcy piszą autora, bez zmian. Po poprawce z przeglądu QA (dzieło z kilkoma uniwersami sprawdza każde, nie tylko pierwsze alfabetycznie) dochodzi czwarta: „Arthas Warcraft” zamiast „Arthas Golden”.

## 2026-11-23 (257) — Snajper szuka najcenniejszych wydań po ISBN

- Wyszukiwarka Vinted znajduje ogłoszenie także po numerze ISBN wpisanym w opis albo pole ISBN (sprawdzone na żywo: 3 z 4 znanych ogłoszeń). Snajper ma teraz jedno miejsce w partii na wyszukanie po ISBN: po kolei 24 najcenniejsze wydania z pewną wyceną (od 40 zł; na kopii bazy od Mort, Fantastyka 1996, 270 zł, przez Diablo: Wojna grzechu, 170 zł, do Zabójcy smoków, 60 zł). Przy przebiegu co 20 min każde z nich co ok. 8 godzin. Liczba fraz w partii bez zmian (10).
- Po co: tak wychodzą ogłoszenia z literówką albo z tytułem bez słów frazy. W próbie na 6 najcenniejszych wydaniach po 1 takim ogłoszeniu znalazło się w 3 z nich („Diablo. Wojna grzechów”, „World of Warcraft kronika tom 2”), raz trafiło się coś zupełnie innego („The kissing booth 2”).
- Wynik wyszukania po ISBN nie jest odsiewany po tytule (tytuł zwykle nie ma numeru); odpada tylko to, co nie jest książką. Dowodem przypisania pozostaje wyłącznie ISBN odczytany ze strony ogłoszenia, więc przypadkowe ogłoszenie zostaje nieprzypisane. W „Frazach” i w panelu snajpera ISBN widać jako frazę. Sprawdzone na żywo na kopii bazy przez zwykły skan „najnowsze”: ISBN Diablo: Wojna grzechu dał 7 ogłoszeń, 0 odrzuconych, 7 zapisanych.

## 2026-11-23 (256) — Sprawdzanie statusu ofert: najpierw tam, gdzie wycenie brakuje sprzedaży

- Aplikacja sprawdza w tle, czy oferty, które zniknęły ze skanów, zostały sprzedane (20 stron na rundę). Teraz w pierwszej kolejności sprawdza oferty wydań, które mają okazję z wyceną o niskiej lub średniej wiarygodności: potwierdzona sprzedaż jest dokładnie tym, czego tej wycenie brakuje (wycena z co najmniej 8 obserwacji jest ok. dwa razy trafniejsza). Liczba żądań bez zmian, zmienia się tylko kolejność; reszta zostaje w dotychczasowym sprawiedliwym porządku. Lista takich wydań liczona najwyżej raz na godzinę.
- Na kopii bazy: 216 takich okazji na 148 wydaniach; z kolejki sprawdzeń 47 ofert, które zniknęły ze skanów, i 194 nigdy nie sprawdzone leżą na tych wydaniach. Kolejka i tak schodzi w ok. dobę, więc zysk to sprzedaże potwierdzone kilka do kilkunastu godzin wcześniej, nie nowe dane. Na działającej aplikacji nie sprawdzone.
- Przy okazji sprawdzone i odrzucone na kopii bazy: strumień po wszystkich wycenionych ISBN (spoza katalogu tylko 11 z pewną wyceną, bez cofania usuniętych dzieł), koszyk u jednego sprzedawcy (12% oszczędności w grupach ≥ 2 okazji). Szczegóły: `docs/pomysly/kreatywna-2026-11-23-wieczor.md`.

## 2026-11-23 (255) — Snajper: jedna nieudana fraza nie zatrzymuje kolejki

- **Błąd:** gdy w przebiegu snajpera jedna fraza dostała błąd, którego ponowienie nic nie da (np. 404 z Vinted), przebieg był „częściowy”, a kolejka fraz stała w miejscu, więc kolejny przebieg pytał o te same 10 fraz. Przy trwałym błędzie jednej frazy obieg celów zatrzymałby się na dobre. Teraz kolejka idzie dalej, gdy wszystkie błędy przebiegu są tego rodzaju; przy błędzie przejściowym (np. 429) zostaje jak dotąd. Zauważone w próbnym przebiegu na kopii bazy (23.11: „Warhammer” dostał jednorazowo 404, kolejne zapytanie przeszło).
- Ten sam próbny przebieg potwierdził strumień (wpis 254) na żywo: 1 strona, 95 nowych ogłoszeń, 0 z katalogu (przy ok. 0,5% dopasowań to oczekiwane), partia jak zwykle.

## 2026-11-23 (254) — Snajper: „strumień” najnowszych ogłoszeń całej kategorii książek

- Każdy przebieg snajpera zaczyna się od przeczytania najnowszych ogłoszeń **całej kategorii książek Vinted** (do 3 stron, ok. 290 ogłoszeń, przez tę samą bramkę co skany). Gdy któreś ogłoszenie ma w tytule wszystkie słowa frazy dzieła z katalogu, ta fraza idzie na początek partii (do 6 z 10 miejsc), a dalej wszystko jak dotąd: najnowsze ogłoszenia tej frazy, sprawdzenie języka, ISBN ze strony ogłoszenia, okazje, powiadomienia. Dotąd snajper obracał ok. 40 dzieł o najlepszym obrocie; strumień dotyczy każdego dzieła katalogu (na kopii bazy 486 fraz).
- Tytuł tylko wybiera frazę do sprawdzenia, nigdy nie jest dowodem ISBN, a ze strumienia nic nie jest zapisywane. Frazy wyłączone we „Frazach” zostają wyłączone; dzieła usunięte z katalogu się nie liczą. Gdy strumień nie odpowie w 40 s, partia jest taka jak dawniej; gdy Vinted go odrzuci (403/429), ten przebieg kończy się jako „Vinted nie odpowiadał” bez skanu (skan i tak trafiłby na tę samą blokadę), a kolejka fraz czeka.
- Pomiar na żywo (23.11 wieczorem): ok. **90 nowych ogłoszeń książek na minutę** (501 w 5,4 min), z czego ok. 0,5% pasuje do dzieła z katalogu (1 z 192). Trzy strony to więc ok. 3 ostatnie minuty przed każdym przebiegiem: próbka najświeższych ogłoszeń, nie pełne pokrycie (pełne wymagałoby ok. 20 stron na przebieg co 20 min). Spodziewane: ok. 1-2 dzieła z katalogu na przebieg, widziane kilka minut po wystawieniu. Na kopii bazy filtr tytułów obejmuje 82% ofert przypisanych po ISBN, a 94% oznaczonych przez niego przypisanych ofert wskazuje właściwe dzieło.
- Ogłoszenie ze strumienia może też wskazać frazę uniwersum snajpera (Warhammer, Warcraft, Dragonlance, Smocza Lanca, Herezja Horusa), gdy nie pasuje do żadnego konkretnego dzieła; fraza dzieła wygrywa. Ile to daje, nie zmierzone (w 192 odczytanych ogłoszeniach nie było ani jednego z uniwersów).
- W panelu snajpera dopisek, np. „strumień: 287 nowych ogłoszeń książek, 1 z katalogu (Miecz zabójcy demonów)”. Koszt: 1-3 dodatkowe żądania na przebieg. Wyłączenie: `BOOKFLIP_SNIPER_STREAM=0`. Działanie w uruchomionym snajperze na prawdziwych danych nie sprawdzone (sprawdzone testami i jednorazowymi odczytami strumienia).

## 2026-11-23 (253) — Łowca bez kodu kreskowego: szukanie po tytule i ściąga na kiermasz

- Pole w Łowcy przyjmuje teraz ISBN **albo tytuł, autora lub wydawcę**. Stare książki, wyprzedaże bibliotek i kiermasze często nie mają kodu kreskowego (albo jest zaklejony ceną): wpisujesz np. „smoki jesien” i dostajesz listę wydań z wydawcą, rokiem, ISBN i „opłaca się do”; wybierasz to, które masz w ręku, i dostajesz zwykłą kartę z werdyktem. Z ceną z półki każde wydanie na liście ma od razu znacznik (np. „Warto”, „W Twoim celu”). Słowa można skracać i pisać bez polskich znaków; liczą się też uniwersum, cykl i seria wydawnicza wydania oraz Twoje etykiety („warhammer” znajduje „Szpon Ragnara”: na kopii bazy 157 książek, „dragonlance” 51, „warcraft” 53). Książki z katalogu są przed usuniętymi i przed tytułami z samych ogłoszeń. Nic nie jest przypisywane: wybór to Twoje oko, potem jak zawsze ISBN.
- Szukanie działa na danych do pracy bez sieci, więc tak samo w piwnicy bez zasięgu. Paczka zawiera teraz autora, wydawcę i rok, więc karta bez sieci też je pokazuje. Na kopii bazy: 2115 książek, ok. 379 KB (90 KB w przesyle; było 215 / 57 KB), liczona ok. 210 ms; jedno szukanie ok. 1 ms (pierwsze ok. 14 ms). Sprawdzone w Edge przy szerokości telefonu na kopii bazy; na prawdziwym telefonie nie sprawdzone.
- **Ściąga na kiermasz** (rozwijana pod formularzem): książki z katalogu z pewną wyceną (wysoka lub średnia) albo z Twoim celem „Kupuję do”, z ceną „bierz do” (75% wyceny albo cel, od 10 zł), najcenniejsze najpierw albo po nazwisku autora (jak stoją na półce), z polem „Zawęź” (np. „warhammer”: 20 książek). „Drukuj” drukuje samą tabelę, czarno na białym także w ciemnym motywie (sprawdzone jako PDF w Edge: 113 książek na 6 stronach A4; na drukarce nie sprawdzone). Na kopii bazy: 113 książek, na górze Mort (Fantastyka 1996, bierz do 202 zł), Diablo: Wojna grzechu (Insignis, 127 zł), Malfurion (97 zł).
- Tytuły z samych cyfr („1984”, „451”) są szukane jak tytuły, nie sprawdzane jak ISBN. Telefon z paczką sprzed tej zmiany nadal odpowiada z niej po ISBN, a nową pobiera przy pierwszym połączeniu. Bez paczki i bez połączenia szukanie mówi wprost, że danych na tym urządzeniu nie ma.
- Odrzucone przy pomiarze: filtr „tylko te, których nie ma w ofertach” dawał 0 książek (pewna wycena wymaga ofert), więc go nie ma.

## 2026-11-23 (252) — Powiadomienia o nowych okazjach na telefonie

- W „Okazjach”, w panelu snajpera, przycisk „Włącz powiadomienia na tym urządzeniu”. Telefon, który je włączy, dostaje powiadomienie, gdy pojawi się nowa okazja (te same, które dotąd widać było tylko przy otwartej aplikacji w „Nowych okazjach”), także przy zamkniętej stronie. Kilka okazji naraz to jedno powiadomienie, np. „BookFlip: 3 nowe okazje — Legion — 15 zł (Vinted), warta ok. 45 zł; i 2 inne”. Dotknięcie otwiera Okazje. „Wyślij próbne” sprawdza, czy działa.
- Po co: pomiar z 22.11 pokazał, że alert był oglądany średnio po ok. 1,2 h, bo dało się go zobaczyć tylko w otwartej aplikacji.
- Jak to działa: wiadomość idzie przez usługę powiadomień producenta przeglądarki (Google dla Chrome/Androida, Apple dla iPhone'a, Microsoft dla Edge, Mozilla dla Firefoksa). Każda jest zaszyfrowana kluczem tego telefonu (standard Web Push), więc usługa nie widzi treści. Komputer wysyła wiadomości tylko pod adresy tych usług. Bez dodatkowych programów. Usługi powiadomień nie dostają ani Twojego e-maila, ani nazwy komputera w Tailscale (podpis serwera ma stały, neutralny adres). Telefon, do którego 10 wysyłek z rzędu się nie uda (np. dłuższy brak internetu na komputerze), wypada z listy i trzeba włączyć powiadomienia ponownie. Wymaga adresu HTTPS przez Tailscale; na iPhonie najpierw „Dodaj do ekranu początkowego” (stąd nowy plik opisu aplikacji). Telefon, którego przeglądarka wycofała zgodę, jest usuwany z listy. Wyłączenie wszystkiego: `BOOKFLIP_PUSH=0`. Okazje powstają po przebiegu identyfikacji, więc najszybciej przy włączonym snajperze.
- Sprawdzone: szyfrowanie odtwarza bajt w bajt przykład z RFC 8291, podpis VAPID weryfikuje się kluczem publicznym, wysyłka i usuwanie subskrypcji na atrapie usługi. **Na prawdziwym telefonie i prawdziwej usłudze powiadomień nie sprawdzone.**

## 2026-11-23 (251) — Łowca bez sieci

- W piwnicy antykwariatu czy w hali kiermaszu często nie ma zasięgu, a telefon łączy się z komputerem przez Tailscale, który potrzebuje internetu. Teraz Łowca trzyma na telefonie paczkę danych: każdy ISBN, który umie ocenić (wycena, „opłaca się do”, Twój cel „Kupuję do”, sztuki w zapasie, „usunięte z katalogu”, oferty teraz). Gdy komputer nie odpowiada, odpowiedź przychodzi z paczki, z dopiskiem „Bez połączenia z komputerem — odpowiedź z danych z 23.11, 19:38”. Skanowanie aparatem działa tak samo.
- Paczka pobiera się sama przy otwarciu Łowcy z połączeniem, gdy jest starsza niż 6 godzin; przycisk „Odśwież dane bez sieci” robi to od razu, a linia pod nim mówi, ile książek obejmuje i z kiedy jest. Na kopii bazy: 2115 książek (każdy ISBN z katalogu, także bez wyceny, plus ISBN wycenione z samych ofert), ok. 215 KB (57 KB w przesyle), liczona 206 ms; odpowiedzi z paczki zgadzają się z Łowcą na żywo (85 z 85 sprawdzonych ISBN). Gdy komputer nie odpowiada przez 6 s (zawieszone połączenie przy jednej kresce), Łowca też odpowiada z paczki; błąd samego serwera nie jest zasłaniany paczką.
- Żeby sama strona otwierała się bez połączenia, przeglądarka trzyma kopię plików aplikacji (service worker; tylko na adresie HTTPS przez Tailscale lub na tym komputerze). Z połączeniem pliki zawsze idą świeże z komputera; kopia jest używana tylko, gdy połączenia nie ma albo plik nie przychodzi przez 5 s. Kopia obejmuje tylko stronę, skrypty i style, nigdy dane ani zdjęcia. Inne widoki bez połączenia nie mają danych.
- Sprawdzone w Edge na kopii bazy: pobranie paczki, przełączenie w tryb bez sieci, przeładowanie strony i sprawdzenie książki. Na prawdziwym telefonie nie sprawdzone. Paczka zawiera Twoje dane (wyceny, cele, zapas) i zostaje w pamięci przeglądarki telefonu.

## 2026-11-23 (250) — Łowca: skanowanie aparatem i wycena książek spoza katalogu

- **Skanuj aparatem:** w Łowcy przycisk włącza tylny aparat telefonu i czyta kod kreskowy z tyłu książki (ISBN). Każda zeskanowana książka jest od razu sprawdzana i trafia do sesji w sklepie. Przy „Skanuj ciągle (całe pudło książek)” aparat zostaje włączony na następną książkę; cena z półki zostaje ta sama, więc pudło „wszystko po 5 zł” przechodzisz bez dotykania ekranu. Krótki dźwięk i wibracja mówią, co wyszło (podwójny wysoki ton: warto albo w Twoim celu; niski: brak danych), a pasek pod podglądem pokazuje werdykt, tytuł, „opłaca się do” i ocenianą cenę z półki. Szybko skanowane książki są sprawdzane po kolei i każda trafia do sesji; brak połączenia ma osobny sygnał (trzy krótkie wibracje) i komunikat. Aparat wyłącza się po wyjściu z Łowcy albo schowaniu strony, także gdy jeszcze się uruchamiał.
- Działa bez dodatkowych programów: Chrome na Androidzie używa wbudowanego czytnika kodów, a inne przeglądarki (Safari na iPhonie, Edge, Firefox) własnego dekodera aplikacji. Aparat wymaga bezpiecznego adresu, czyli HTTPS przez Tailscale (`docs/TAILSCALE.md`) albo tego komputera. Na zwykłym adresie przycisk jest wyłączony z wyjaśnieniem, a ISBN można wpisać ręcznie jak dotąd. Sprawdzone na sztucznym obrazie z aparatu w Edge (odczyt ok. 1,5 s od włączenia); na prawdziwym telefonie nie sprawdzone.
- **Książki spoza katalogu:** gdy ISBN nie ma wydania w katalogu, Łowca wycenia go z zapisanych ofert, które mają w ogłoszeniu ten sam ISBN (bez zestawów). Tytuł pochodzi wtedy z ogłoszeń i jest tak oznaczony. Nic nie jest przypisywane, a oferty, które przypisałeś do jakiegoś wydania, się nie liczą (ręczne decyzje wygrywają). To samo dotyczy wydań bez własnych cen, np. dzieł usuniętych z katalogu (ich oferty są odrzucone). Na kopii bazy, na 400 losowych ISBN widzianych w ofertach, Łowca wyceniał dotąd 137 (34%), teraz 374 (94%); mediana odpowiedzi 25 ms.
- Na karcie dochodzą: **„Opłaca się do”** (najwyższa cena z półki, przy której werdykt to jeszcze co najmniej „Raczej tak”, czyli 75% wyceny), Twój cel „Kupuję do” (cena w celu = „W Twoim celu”, jak w Okazjach), „Masz już N sztuk w zapasie” i „Usunąłeś to dzieło z katalogu”. Książki spoza katalogu nie mają przycisku „Kupiłem” (zapas wymaga wydania), ale można je oznaczyć „Biorę”.

## 2026-11-22 (249) — Okazje o niskiej wiarygodności wyceny: „do sprawdzenia” zamiast jednej liczby

- Gdy włączysz „pokaż niską wiarygodność”, karta okazji z niepewną wyceną nie podaje już „warta ~X zł” jak faktu: pokazuje znacznik „do sprawdzenia”, przedział wyceny („wycena orientacyjnie”) i przycisk „Kupuję do…”, który otwiera wydanie z polem ceny docelowej.
- Karty o średniej i wysokiej wiarygodności, ranking i filtry bez zmian. Wyświetlany jest przedział wyceny; min–max żywych ofert wydania nie jest w danych okazji.

## 2026-11-22 (248) — Snajper: frazy o najlepszej wydajności nie liczą pierwszego wczytania

- Wydajność frazy (okazje na żądanie) pomijała dotąd tylko prawdę o przepływie: pierwsze wczytanie frazy zbiera wszystko, co już leży na rynku (Harry Potter: 15 okazji z 10 żądań). Teraz pierwszy w historii przebieg frazy nie liczy się wcale (ani jego żądania, ani oferty zobaczone w nim po raz pierwszy); jeśli pierwszy przebieg był przed oknem 14 dni, nic się nie zmienia. Wygładzanie bez zmian.
- Na kopii bazy wybór 6 fraz: było Harry Potter, Terry Pratchett, Legion, Ucieczka Eisensteina, Fourth Wing, Margaret Weis; jest Terry Pratchett (20 okazji / 150 żądań), Fourth Wing, Margaret Weis, Salvatore, Iron Flame, Legion.

## 2026-11-22 (247) — Okładki etykiety: lista „Przenieś do podetykiety” zwijała się od razu

- **Błąd:** w widoku Okładki lub Etykiety każde kliknięcie gdziekolwiek na stronie przerysowywało cały katalog, więc rozwinięta lista podetykiety na okładce od razu się zamykała (i traciła fokus). Przyczyną był przycisk przełączania widoku katalogu, którego obsługa łapała też całą stronę. Teraz lista zostaje otwarta, a katalog nie jest już przerysowywany przy zwykłych kliknięciach. Dodatkowo okładka nie daje się przeciągać, dopóki używasz jej listy.
- Po wybraniu podetykiety z listy na okładce widok zostaje tam, gdzie był (nie przeskakuje do sekcji, do której trafiła książka); fokus przechodzi na okładkę, która zajęła jej miejsce.

## 2026-11-22 (246) — Snajper: dwa sloty dla fraz o najlepszej wydajności okazji

- Partia snajpera (10 fraz) rezerwuje do 2 slotów dla fraz, które w ostatnich 14 dniach dały najwięcej okazji na żądanie do Vinted (wygładzone: (okazje + 1) / (żądania + 50), więc mała próba nie wygrywa sama). Sloty obracają się po 6 najlepszych frazach, pomijają frazy wyłączone w „Frazach” i te już w partii; liczba żądań na przebieg bez zmian (sloty z puli zwykłych celów).
- Na kopii bazy (532 ms, raz na przebieg) wybrałoby dziś: Harry Potter (15 okazji / 10 żądań, głównie pierwsze wczytanie), Terry Pratchett (39 / 160), Legion (6 / 20), Ucieczka Eisensteina, Fourth Wing, Margaret Weis. Cele z obrotu miały w pomiarze 0 okazji na powtórkach.
- Koszt: przy pełnych slotach (niska pewność 3, uniwersa 2, wydajność 2) na zwykłe cele z obrotu zostają 3 miejsca z 10, więc pełny obieg ok. 40 takich celów trwa ok. 14 przebiegów (ok. 4,5 h przy 20 min) zamiast ok. 7. Ranking wydajności liczy się najwyżej raz na godzinę, a jego błąd zostawia tylko puste sloty wydajności — przebieg snajpera idzie dalej.

## 2026-11-22 (245) — Okładki etykiety: podział na podetykiety i przeciąganie między nimi

- Gdy etykieta ma podetykiety, „Układaj okładki” pokazuje okładki w sekcjach: „Bez podetykiety” i po jednej na każdą podetykietę, w tej samej kolejności i z tymi samymi nazwami co na liście książek. Pusta podetykieta to pole „Upuść tu okładkę”.
- Przeciągnięcie okładki na okładkę z innej sekcji przenosi ją do tej podetykiety i wstawia przed upuszczoną; upuszczenie na sekcję (lub puste pole) dodaje ją na koniec sekcji. Przeciąganie w obrębie sekcji zamienia miejscami jak dotąd. Kolejność etykiety nadal jest jedna lista, sekcje to tylko widok. „Cofnij” w powiadomieniu przywraca podetykietę i miejsce.
- Bez myszy: na każdej okładce lista „Przenieś do podetykiety”; strzałki ←/→ (Ctrl+←/→) zamieniają teraz okładkę z sąsiadem w jej sekcji. Błąd zapisu to powiadomienie i ponowny odczyt z serwera. Etykieta bez podetykiet wygląda jak dotąd.

## 2026-11-22 (244) — Okazje: filtr „Tylko najtańsze w wydaniu” i znacznik „najtańsza”

- Każda okazja ma teraz znacznik `cheapestLive`: jej cena jest ściśle niższa niż każda inna kupowalna, świeża (widziana w ciągu 14 dni) oferta tego samego wydania, z dowolnego źródła, niezależnie od stanu egzemplarza i łącznie z ofertami nowych książek ze sklepów (poza ofertami w zestawach); remis nie liczy się, jedyna oferta wydania liczy się. Na kopii bazy to 126 z 202 okazji (62%).
- W „Okazjach” nowy przełącznik „Tylko najtańsze w wydaniu” (obok „Ukryj zwykle odrzucane”, jak pozostałe filtry niezapamiętywany) i mały znacznik „najtańsza” na karcie. Kolejność i wycena bez zmian.

## 2026-11-22 (243) — Strażnik nagłego spadku liczby ofert: nie oznaczam zniknięć po podejrzanie pustym odczycie

- Przed oznaczeniem ofert jako „Mogła zniknąć” skan porównuje liczbę kart, które zwrócił pełny odczyt frazy w źródle, z poprzednim pełnym odczytem tej samej pary (z zapisanych podsumowań skanów, bez migracji). Gdy było co najmniej 10 kart, a jest mniej niż 20%, nic nie jest oznaczane dla tej pary, a podsumowanie skanu dostaje problem „Podejrzanie mało ofert: 0 zamiast 214 — możliwa zmiana strony; nie oznaczam zniknięć” (widoczny w statusie źródła). Odczyt z problemem nie jest punktem odniesienia, więc trwała awaria nie „oswaja się”; kolejny normalny odczyt decyduje. Trwałe, prawdziwe zmniejszenie (np. 400 -> 60 kart, bo sklep sprzedał zapas albo fraza została zawężona) staje się nowym poziomem po dwóch kolejnych odczytach w granicach ±20% od siebie: drugi z nich nie jest już oznaczany i zniknięcia liczą się normalnie. Poziom 0 kart nigdy nie jest akceptowany (to znamię zepsutego układu). Do okna 40 skanów liczą się tylko skany seryjne, nie „najnowsze” (snajper). Parser NWS uznaje kartę za rozpoznaną, gdy ma tytuł lub link do oferty (sprzedane egzemplarze bez ceny i zdjęcia nie dają fałszywego błędu).
- Progi z odtworzenia na kopii bazy (49 skanów): 2214 porównań przy bazie co najmniej 10 kart, najniższy zdrowy stosunek 0,62; strażnik odpaliłby 190 razy, wszystkie to awaria układu NWS (406 -> 0), 0 fałszywych alarmów.

## 2026-11-22 (242) — Antykwariat NWS: pusty odczyt po zmianie układu strony nie liczy się jako „koniec”

- **Błąd:** od 19.11.2026 sklep Antykwariat NWS ma nowy układ kart (zdjęcie w `<picture>`), więc parser gubił wszystkie karty: skan czytał 26 stron z 0 ofert i uznawał to za pełny odczyt do końca (wcześniej 28 stron i 5-6 + 11 ofert na ostatnich stronach kategorii). Przez to 3 oferty NWS (Margaret Weis) zostały oznaczone jako „Mogła zniknąć”, choć nic nie wskazuje, że znikły. Parser czyta nowy układ, a strona z kartami bez jednej rozpoznanej karty (zdjęcie, tytuł, cena) kończy się błędem odczytu, nie pustą listą. Przy starcie aplikacja jednorazowo przywraca te oferty do „niepotwierdzona” (na kopii bazy: 3 z 3 ofert NWS w tym stanie). Pozostałe źródła sprawdzone: Skupszop.pl (14 ofert „mogła zniknąć”), Empik, Tezeusz, sklepy-kategorie i Allegro Lokalnie nie mają tego błędu (szczegóły: `docs/pomysly/2026-11-22-audyt-uciecia.md`).

## 2026-11-22 (241) — Vinted: budżet przedziałów cenowych dzielony po kolei między frazy

- **Błąd:** limit 40 stron na skan na przedziały cenowe zjadała zawsze pierwsza ucięta fraza, a kolejne dostawały „limit”. Na kopii bazy 11 fraz Vinted dochodzi do 10. strony. Teraz aplikacja pamięta (ustawienie `vinted_band_turns_v1`), która fraza dostała przedziały ostatnio, i oddaje budżet tej, która czeka najdłużej. Pełna runda przy ~40 stronach na frazę to 11 skanów (11 × 40 / 40); frazy, które się mieszczą w mniejszej liczbie stron, kończą szybciej. Limit 40 dodatkowych stron na skan bez zmian.

## 2026-11-22 (240) — Vinted: fałszywe „mogła zniknąć” po odczycie uciętym na 10. stronie

- **Błąd:** oferty, których nie zwrócił odczyt uciętej frazy (Vinted daje najwyżej 10 stron), były oznaczane jako „Mogła zniknąć”, choć wciąż wisiały. Przy starcie aplikacja jednorazowo przywraca im stan „niepotwierdzona”, jeśli oznaczył je wyłącznie odczyt dochodzący do 10. strony (na kopii bazy: 34 z 38 ofert Vinted w tym stanie; pozostałe 4 zniknęły według odczytu pełnego albo mają późniejszy wpis i zostają). Oferty z późniejszą zmianą stanu (np. ręczną) nie są ruszane; stary wpis „mogła zniknąć” zostaje w historii, a naprawę widać jako późniejszy wpis „nieznany”. Indeks rynku liczy „mogła zniknąć” jako koniec czasu na rynku, więc zmieniło się 8 z 548 edycji (łączny czas ofert 26 155 → 26 174 dni, sprzedaże bez zmian: 174). Granice przedziałów cen sprawdzone na żywo (5 zapytań): „do” i „od” są włącznie (oferty za 15,00 zł są w obu), więc przedziały nie mają luk.

## 2026-11-22 (239) — Vinted: szerokie frazy czytane w przedziałach cenowych

- **Błąd:** Vinted podaje najwyżej 10 stron (960 ofert) na jedno zapytanie. „Warcraft” miał na Vinted 960 pokazanych ofert, a po zawężeniu ceną: do 30 zł 484, od 30 zł 648 (razem 1132, więc co najmniej 172 oferty były niewidoczne). Skan szerokiej frazy, która sięga 10. strony, czyta ją teraz dodatkowo w czterech przedziałach (do 15 zł, 15-30, 30-60, od 60 zł) przez tę samą bramkę, z limitem 40 dodatkowych stron na cały skan. Odczyt, który nie obejmie wszystkiego (limit lub przedział też ucięty), nie liczy się jako „do końca”, więc nie oznacza ofert jako zniknięte. Szybki skan (najnowsze) bez zmian.

## 2026-11-22 (238) — Zapis do pomiarów: skąd skan i czy alert był jeszcze do kupienia

- Każdy skan zapisuje w podsumowaniu, jak i przez kogo został uruchomiony (tryb: wsadowy lub najnowsze; start: ręczny, harmonogram, szybki skan, snajper), a obejrzenie alertu „Nowe okazje” zapisuje, czy oferta była wtedy jeszcze dostępna (migracja 150). Bez zmian w wyglądzie i działaniu; pozwala powtórzyć pomiar „czy jesteśmy pierwsi” po dobie pracy snajpera.

## 2026-11-22 (237) — Kolejka przeglądu: karta „Uniwersa”

- W „Do weryfikacji” jest nowa karta „Uniwersa” z liczbą: dostępne oferty czekające na decyzję, których tytuł nazywa jedno z Twoich uniwersów (ta sama definicja co etykiety i snajper, `universes.mjs`), od najdroższej. Bez podręczników i wydań obcojęzycznych, bez nie-książek (figurki, gry, e-booki) i bez ofert Empik. Na kopii bazy to **136** ofert na łączną kwotę **20 678 zł**. Sam widok: nic nie jest przypisywane ani zapisywane; ISBN z okładki wpisujesz zwykłą ścieżką ręczną. Karta nakłada się na inne (oferta jest też w „Bez ISBN” itd.) i nie wchodzi do sumy „Wszystkie”.

## 2026-11-22 (236) — Okazje: znacznik „Nowa nie drożej”

- Okazja z oferty używanej dostaje znacznik „Nowa nie drożej: Empik 39,90 zł” (z linkiem do oferty), gdy najtańsza aktualna oferta „Nowe w sklepie” tego samego wydania kosztuje tyle samo lub mniej niż sama oferta (ceny bez wysyłki). Na kopii bazy to **4 z 170** okazji z ofert używanych (np. Kosmiczny wilk: Vinted 80 zł, nowe 71,05 zł). Sam znacznik: kolejność, wycena i zestaw okazji bez zmian; oferty sklepowe nie są znakowane względem siebie, a niedostępne oferty sklepowe i ceny od 10 000 zł się nie liczą. Znacznik ma większy odstęp (wysokość ok. 28 px zamiast 20), by łatwiej trafić go palcem, i zawija się w wąskiej karcie.

## 2026-11-22 (235) — Data wystawienia ofert Vinted: poprawka „wczoraj” i uzupełnianie w tle

- **Błąd:** wiek ogłoszenia „wczoraj” nie był rozpoznawany, więc te oferty (najświeższe) zostawały bez daty wystawienia — **102** na kopii bazy. Teraz „wczoraj” daje datę sprzed doby; istniejące wiersze naprawia jednorazowe zadanie startowe (doba przed pierwszym zobaczeniem).
- Na kopii bazy **2437 z 6668** ofert Vinted nie miało daty wystawienia, w tym **2140** nadal do kupienia; **153 z 202** okazji na liście nie miało daty (wypadały z indeksu rynku i świeżości okazji). Pamięć podręczna szczegółów nie przechowuje wieku, więc nic w niej nie ginęło — brak wynikał ze starych wierszy.
- Nowe zadanie w tle (`listing-age-backfill.mjs`, migracja 149): co 4 min do 5 stron ogłoszeń Vinted bez daty, od najstarszego pierwszego zobaczenia, przez bramkę; każda strona raz, blokada wstrzymuje zadanie na 30 min. Wyłączenie: `BOOKFLIP_LISTING_AGE=0`. Przy tym tempie 2140 ofert to ok. 29 godzin pracy aplikacji.

## 2026-11-22 (234) — Snajper pilnuje uniwersów także bez historii obrotu

- **Błąd:** gdy sito snajpera nie dawało żadnego zwykłego celu (świeża instalacja albo baza bez wycen od 25 zł), przebieg kończył się „brak celów” i frazy uniwersów właściciela (Warhammer, Warcraft, Dragonlance…) też nie były pytane. Teraz przebieg pyta wtedy same 2 frazy uniwersów, po kolei; fraza wyłączona przez właściciela nadal zostaje wyłączona.

## 2026-11-22 (233) — Snajper pilnuje też uniwersów właściciela

- Snajper brał tylko dzieła z najlepszym obrotem i wyceną od 25 zł. Na kopii bazy sito przepuściło **3 z 228** dzieł Warhammera, Dragonlance i Warcrafta (Warcraft 2, Warhammer 1, Dragonlance 0) — rzadkie tytuły, których szuka właściciel, nie były w ogóle obserwowane. Z 73 celów snajpera 3 to uniwersa właściciela.
- Teraz w każdej partii 2 miejsca (z 10) zajmują po kolei frazy: Warhammer, Warcraft, Dragonlance, Smocza Lanca, Herezja Horusa — każda co ok. 50 min przy interwale 20 min (fraza będąca też zwykłym celem nie jest pytana dwa razy w partii). Fraza wyłączona przez właściciela w statystykach fraz zostaje wyłączona; wielkość partii i liczba zapytań na przebieg bez zmian (regularnych celów jest w partii o 2 mniej). **Nie zmierzono** jeszcze, ile nowych ofert to da.

## 2026-11-22 (232) — Profil skanu „Dragonlance po polsku”

- Polskie tytuły Dragonlance rzadko niosą słowo „Dragonlance” („Smoki jesiennego zmierzchu”, „Kroniki Smoczej Lancy”), więc fraza uniwersum omijała klasyczne wydania Zysk i S-ki. W kopii bazy: 145 ofert z słowem „Dragonlance” w tytule, a pod tytułami klasyków tylko 2–9 ofert na tytuł (Smoki jesiennego zmierzchu 5, zimowej nocy 9, wiosennego świtu 2, letniego płomienia 6, Kroniki Smoczej Lancy 2).
- Nowy profil skanu „Dragonlance po polsku” (8 fraz: tytuły cyklu i „Weis Hickman”) dodawany raz do istniejącej instalacji i do świeżej; usunięty przez właściciela nie wraca. Istniejących, edytowanych profili nie ruszam. Skan jak dotąd przez bramkę; przy rotacji „wszystkie profile” co 12 h pełny obieg trwa teraz 48 h zamiast 36 h. **Nie zmierzono jeszcze**, ile nowych ofert fraza przyniesie — to wynik po pierwszym skanie.

## 2026-11-22 (231) — Nowe źródło: Antykwariat Exlibris

- Antykwariat Exlibris (antykwariat-exlibris.com, WooCommerce) jest czytany po kategorii „Fantastyka — Fantasy, Science-Fiction” (15 stron po 24), w tempie bramki, raz na dobę jak pozostałe antykwaria. `robots.txt` zakazuje tylko `?add-to-cart=`, katalogów administracyjnych i API; regulamin bez zakazu. Na liście jest „Seria Tytuł – Autor” i cena; ISBN i stanu nie ma.
- Na żywych stronach (2026-11-22, 15 stron): 342 pozycje, wszystkie dostępne. Trafienia: Warhammer 0, Dragonlance 0, **Warcraft 2** („World of Warcraft: Wichry wojny” 15 zł, „World of Warcraft: Zbrodnie wojenne” 28 zł).

## 2026-11-22 (230) — Nowe źródło: Antykwariat Królicza Jama

- Antykwariat Królicza Jama (kroliczajama.pl, RedCart) jest czytany po kategoriach fantasy (52 strony), science fiction (50) i horror (16), po 24 pozycje, w tempie bramki (`robots.txt`: `Crawl-delay: 1`, reszta dozwolona; regulamin bez zakazu), raz na dobę jak pozostałe antykwaria. Tytuł ma postać „Autor • Tytuł”. Egzemplarz niedostępny zostaje na liście ze starą ceną i napisem „Produkt niedostępny” — nie jest ofertą.
- Na żywych stronach (2026-11-22, 118 stron): 2790 pozycji, z czego tylko **121 dostępnych** (reszta to archiwum sprzedanych). Trafienia na frazy właściciela: Warhammer 2, Dragonlance 10, Warcraft 4 — **wszystkie niedostępne, więc 0 ofert**. Źródło jest więc dziś głównie odniesieniem cenowym i sygnałem sprzedaży; koszt to ok. 118 zapytań na przebieg.

## 2026-11-22 (229) — Nowe źródło: Copernicus Corporation (Black Library po polsku)

- Sklep Copernicus Corporation (copcorp.pl, WooCommerce, nowe książki; rodzaj oferty „Nowe w sklepie”) jest czytany po kategoriach „Książki Warhammer 40.000” (4 strony), „Książki Warhammer” (2 strony) i „Age of Sigmar” (1 strona), po 24 pozycje, w tempie bramki, raz na dobę. `robots.txt` zakazuje tylko `?add-to-cart=` oraz katalogów administracyjnych. Tytuł może leżeć w dwóch kategoriach — jest zapisywany raz, po adresie.
- Lista ma tylko tytuł (bez autora), cenę bieżącą (przy promocji nie przekreśloną) i stan magazynu; **ISBN jest tylko na stronie produktu**, której skan nie czyta (ok. 144 dodatkowe zapytania na przebieg), więc oferty bez ISBN trafiają do zwykłej identyfikacji po tytule. Sklep ma pole `topic: Warhammer` — fraza „Warhammer” trafia we wszystkie książki.
- Na żywych stronach (2026-11-22): 144 różne książki, 135 dostępnych, 9 „brak w magazynie”. Trafienia: **Warhammer 144 (135 dostępnych)**, Dragonlance 0, Warcraft 0.

## 2026-11-22 (228) — Nowe źródło: Insignis (sklep wydawcy, Warcraft)

- Sklep wydawcy Insignis (sklep.insignis.pl, PrestaShop, nowe książki) jest czytany po dwóch kategoriach: „World of Warcraft” (10 pozycji) i „Outlet” (18 pozycji), po jednej stronie na kategorię (rozmiar strony 80 jest częścią adresu sklepu), w tempie bramki, raz na dobę jak pozostałe źródła kategorii. Rodzaj oferty: „Nowe w sklepie”. `robots.txt` zakazuje `order=`, `n=`, `search_query=` i `controller=search` — skan używa tylko ścieżek kategorii z `resultsPerPage=`.
- Na liście jest tytuł, autor (z opisu okładki), bieżąca cena (nie przekreślona regularna), ISBN w adresie produktu (7 z 10 książek Warcraft) i „Obecnie brak na stanie” — taka pozycja nie jest ofertą. Na żywych stronach (2026-11-22): Warcraft 10 pozycji, z tego 9 dostępnych; outlet 18, z tego 17 dostępnych (to głównie poradniki, bez Warcrafta). Trafienia: **Warcraft 10**, Warhammer 0, Dragonlance 0.

## 2026-11-22 (227) — Nowe źródło: Antykwariat Gelber

- Antykwariat Gelber (Warszawa, WordPress) jest czytany po kategoriach „Fantastyka, fantasy, SF i horror — zagraniczna” (43 strony) i „— polska” (20 stron), po 10 pozycji na stronę, w tempie bramki, raz na dobę jak pozostałe antykwaria. `robots.txt` niczego nie zakazuje. Na liście jest wszystko: ISBN, wydawca, oprawa, stan (db/bdb/dst), cena i „Pozycja dostępna”; egzemplarz „obecnie niedostępny” zostaje na liście bez ceny i nie jest ofertą. Zamówienie idzie e-mailem lub telefonem (bez koszyka).
- Na żywych stronach (2026-11-22, 63 strony kategorii plus 3 zapytania wyszukiwarki sklepu): 615 różnych wpisów (426 zagranicznych, 189 polskich), 566 dostępnych z ceną, z tego 458 z ISBN i 558 ze stanem. Uniwersa: **Warhammer 1** (Anthony Reynolds, „Piętno chaosu”, 115 zł), Dragonlance 0, Warcraft 0. Notatka sklepu pod zdjęciem („Powieść ze świata Warhammera”) jest dopisywana do tytułu w nawiasie, żeby fraza „Warhammer” znalazła tę książkę.
- Odrzucone przy tym rozpoznaniu (powody w `docs/SOURCES-ACCESS-2026-11.md`): Antykwariat Książki (antykwariat-ksiazki.pl), Antykwariat im. Żupańskiego (Poznań), Antykwariat im. Jaworskiego (Wrocław), TakCzytam, antykwariat.waw.pl i inne.

## 2026-11-22 (226) — Snajper: częściej dzieła z okazją o niskiej pewności wyceny

- Sprzedaże (znikające oferty) budują wycenę, a 120 z 209 okazji miało wycenę o niskiej pewności. Snajper rezerwuje teraz do 3 z 10 fraz na przebieg dla dzieł z taką okazją (według oczekiwanego zysku, po kolei), pomijając dzieła już objęte zwykłą rotacją. Liczba zapytań na przebieg bez zmian (10), nadal ten sam endpoint skanu i brama.
- Na kopii bazy: 40 dzieł zwykłej rotacji, 80 dzieł z okazją o niskiej/żadnej pewności (7 już w rotacji, 73 nowych). Pełny obieg zwykłej rotacji wydłuża się z 4 do 6 przebiegów; obieg dzieł z niską pewnością to ok. 25 przebiegów.

## 2026-11-22 (225) — Przegląd układu: tablet, motyw ciemny, telefon

- Sprawdzone w Edge (390, 1000 i 1280 px, jasny i ciemny motyw; widoki Dziś, Okazje, Łowca, Kolejka, Książki, Skan, Ustawienia): bez poziomego przewijania strony i bez nakładających się elementów, cele dotykowe na telefonie co najmniej 40 px, ciemny motyw Skan i Ustawienia czytelny.
- **Błąd:** „Skan” przy szerokości 901–1099 px (tablet) pokazywał najpierw długą listę stanu źródeł w połowie szerokości, a formularz skanu spadał pod ekran; stan źródeł stoi teraz obok formularza od 901 px.
- **Błąd:** „Okazje” → „Indeks rynku” na telefonie: pole „Sortuj” było ucięte, a „Tylko wiarygodne wyceny” poza ekranem; kontrolki zawijają się teraz do kolejnych wierszy.
- Nie sprawdzono na prawdziwych danych (pusta baza), więc mapa rynku i wiersz profili w Skanie na telefonie nie były oglądane z zawartością.

## 2026-11-22 (224) — Podetykiety: przegląd wizualny

- Przegląd widoku etykiety w Edge (1440 i 390 px, jasny i ciemny motyw): bez przepełnień i poziomego przewijania. **Błąd:** na telefonie przycisk „×” (usuń z etykiety) miał 39 px szerokości; ma teraz co najmniej 44 px.

## 2026-11-22 (223) — Podetykiety w etykietach

- W widoku etykiety (lista „Książki i numery tomów”) możesz dzielić książki na **podetykiety**: „Dodaj podetykietę”, zmiana nazwy i usunięcie przy nagłówku, a przy każdej książce pole „Podetykieta” do przenoszenia. Książka jest w najwyżej jednej podetykiecie; bez przypisania zostaje na głównej liście. Nagłówki zwijają się; kolejność i numery tomów się nie zmieniają.
- Podetykiety nie są znacznikami: nie widać ich nigdzie poza widokiem etykiety, a „Rynek” etykiety działa jak dotąd na całej etykiecie. Usunięcie podetykiety zwraca jej książki na główną listę (żadna książka nie jest usuwana); zmiana nazwy etykiety zachowuje podetykiety, a scalenie dołącza je do etykiety docelowej (podetykieta o tej samej nazwie jest wspólna). Podetykietę można dodać także w pustej etykiecie, a zmiana nazwy podetykiety jest formularzem w stronie (działa na telefonie). Scalenie dwóch dzieł przenosi też przypisanie do podetykiety. Migracja 148.

## 2026-11-22 (222) — Okazje: wiarygodniejsza kolejność i znacznik „może nieaktualna”

- **Kolejność:** oczekiwany zysk jest mnożony przez wagę wiarygodności wyceny (wysoka 1, średnia 0,7, niska 0,4, brak 0,2), więc okazja z mniej wiarygodną wyceną nigdy nie wyprzedza okazji z wiarygodniejszą przy tej samej oszczędności i szansie sprzedaży.
- **Wiek oferty:** na karcie obok „wykryta …” jest „widziana …”; oferta nieodświeżana od ponad 48 godzin, choć inne oferty tej samej książki w tym samym źródle były odświeżone później, ma znacznik „może nieaktualna” (odświeżenie innej książki nie liczy się).
- Na kopii danych: 209 okazji, z tego 120 z niską, 83 ze średnią i 6 z wysoką wiarygodnością wyceny; 8 oznaczonych jako „może nieaktualna”.

## 2026-11-22 (221) — Poprawki po przeglądzie wykresów i nowego układu

- **Mapa rynku:** z klawiatury dostępnych jest tylko 20 kropek o największym obrocie (wcześniej do 200 punktów Tab zatrzymywało fokus przed listą poniżej); mocniejszy kontur fokusu, oś pokazuje też 5 zł, skala nie psuje się przy samych tanich wycenach. **Puls rynku:** odpowiedź `/api/activity` jest przez minutę w pamięci, dopóki dane się nie zmienią (widok „Dziś” pytał o nią przy każdym odświeżeniu), a wolna odpowiedź nie nadpisuje nowszej. **Układ:** wysokość górnej nawigacji i zapas miejsca pod pływającymi przyciskami (170 px zamiast 110, bo dwa przyciski + odstęp to 150 px) są jedną zmienną; usunięta martwa reguła. Nowe testy: brak stylów w atrybutach nowych wykresów (strona ich nie dopuszcza), dzień czasu letniego i okazje w serii aktywności, cache. Nie sprawdzone wizualnie: układ 901–1200 px po tych zmianach.

## 2026-11-22 (220) — Przegląd na telefonie i w ciemnym motywie: poprawki

- Obejrzałem wszystkie widoki na telefonie (jasny i ciemny) i w ciemnym motywie na komputerze. Poprawione: **Mapa rynku** i wykres historii cen na telefonie przewijają się w bok zamiast zmniejszać do nieczytelności; w **Skanie** na telefonie najpierw jest formularz, a stan źródeł pod nim (wcześniej szesnaście wierszy źródeł przed formularzem) i karta formularza już nie wychodzi poza ekran; **Snajper** pokazuje ogłoszone okazje jako dwukolumnowe karty. Nie naprawione: rząd profili w Skanie na telefonie nadal przewija się w bok bez wskazówki.

## 2026-11-22 (219) — Mapa rynku

- W „Rynku” nad listą **mapa wszystkich wydań z wiarygodną wyceną** (na kopii: 133 kropki): oś pozioma to szansa sprzedaży w 30 dni, pionowa wycena (skala logarytmiczna, żeby 10 zł i 300 zł mieściły się na jednej mapie), wielkość kropki to obrót (wycena × szansa). Prawy górny róg to książki warte sporo i szybko schodzące. Podpowiedź po najechaniu (tytuł, wycena, szansa, obrót), klik albo Enter na kropce otwiera książkę. Mapa pokazuje zawsze wyceny o średniej i wysokiej pewności, niezależnie od filtrów listy poniżej. Obejrzane w Edge (jasny i ciemny, 1440 px); telefon nie sprawdzany.

## 2026-11-22 (218) — Wykres historii cen wydania

- W „Historii obserwacji cen” wydania (po „Wczytaj historię”) jest teraz **wykres**: niebieska kropka to każdy zapisany odczyt ceny ofertowej (podpowiedź po najechaniu: data, cena, tytuł ogłoszenia), cienka szara linia łączy odczyty tej samej oferty w czasie, z siatką cen i datami na osiach. To ceny ofertowe, nie sprzedaże (napis nad wykresem to mówi). Jedna seria, jeden kolor — bez legendy dwudziestu barw. Na kopii bazy dla „Kolor magii” (Pratchett): 32 odczyty z 19 ofert, ceny 13–82 zł. Czytnik ekranu dostaje opis liczby odczytów i zakresu dat; poniżej zostaje dotychczasowa lista. Obejrzane w Edge (1440 px); telefon i ciemny motyw nie sprawdzane.

## 2026-11-22 (217) — Okazje: cena na tle widełek wyceny

- Na karcie okazji pasek pokazuje **cenę (czarna kropka) na tle widełek wyceny (zielone pasmo) i samej wyceny (kreska)** na jednej skali — od razu widać, jak daleko cena jest od wartości. Pozycje liczone w przeglądarce (strona nie dopuszcza stylów w atrybutach, więc przechodzą przez `data-*`); czytnik ekranu dostaje opis „Cena …, wycena … (…–…)”. Obejrzane w Edge na kopii bazy (1440 px).

## 2026-11-22 (216) — „Puls rynku”: pierwsze wykresy w aplikacji

- W „Dziś” trzy wykresy słupkowe z ostatnich 30 dni (dni warszawskie): **nowe oferty w skanach**, **oferty, które zniknęły** (sprzedane lub nieaktualne) i **ogłoszone okazje**. Każdy ma własną skalę (liczby różnią się o rzędy wielkości, więc nie ma wspólnej osi), dużą liczbę zbiorczą, średnią dzienną, podpowiedź po najechaniu (np. „11.11: 104”) i tabelę danych pod spodem. Kolory to stała paleta serii (niebieski, pomarańczowy, morski), działają w jasnym i ciemnym motywie. Na kopii Twojej bazy: 10 469 nowych ofert (wysokie słupki to dni dużych skanów, np. 3354 dnia 20.11, więc to rytm skanowania, nie napływ rynku — napis przy wykresie to mówi), 547 zniknęło (do 97 dziennie), 26 okazji ogłoszonych. Nowy endpoint `GET /api/activity?days=` (7–90 dni), tylko odczyt. Obejrzane w Edge (1440 px jasny i ciemny, telefon 390 px); `css-snapshot` i dotyk nie sprawdzane.

## 2026-11-22 (215) — Kolejka: trzy kolumny

- **Kolejka (od 1200 px):** po lewej boczny panel (stan automatycznej identyfikacji, pionowa lista kategorii z licznikami — Wszystkie, Szybkie, Do dodania, Bez ISBN…, wyszukiwarka ofert, „Więcej”), pośrodku lista ofert, po prawej szczegóły z paskiem „Zatwierdź / Odrzuć / Pomiń” widocznym bez przewijania. Zamiast trzech rzędów pigułek nad listą. Poniżej 1200 px układ bez zmian. Obejrzane w Edge na kopii bazy (1440 px); ciemny motyw, praca z klawiaturą i przewijanie długich list nie sprawdzane.

## 2026-11-22 (214) — Książki: boczny panel filtrów i wysuwany panel książki

- **Książki (od 1100 px):** wyszukiwarka, sortowanie, „Tylko niekompletne” i przełącznik Lista / Okładki / Etykiety są w bocznym panelu po lewej (przyklejonym przy przewijaniu), a lista lub galeria okładek zajmuje resztę. **Szczegóły książki wysuwają się jako panel z prawej** (780 px) nad przyciemnioną listą zamiast zastępować ją; klik w przyciemnione tło albo „← Wszystkie książki” zamyka panel, Wstecz w przeglądarce też. Esc zamyka panel (poza szufladą oferty, oknem dialogowym i polem formularza). Na tablecie 901–1099 px filtry zostają w poziomym pasku. Obejrzane w Edge na kopii bazy (1440 px).

## 2026-11-22 (213) — Rewolucja: zmiana STRUKTURY układu i przycisków (komputer)

- **Nawigacja na górze zamiast paska bocznego:** logo, sześć pozycji z ikonami i podpisami (aktywna = ciemna pigułka), Ustawienia i stan połączenia po prawej; treść ma pełną szerokość (do 1440 px). Poniżej tytuł widoku i wyszukiwarka. Telefon bez zmian (dolny pasek).
- **Akcje widoku jako pływający przycisk (FAB)** w prawym dolnym rogu („Dodaj książkę”, „Nowy skan”), zamiast wiersza nad treścią.
- **Okazje: filtry w bocznym panelu** (pionowa lista przełączników, sortowanie, „Przegląd”, licznik) obok galerii kart, od 1100 px. **Karta okazji:** „Kupiłem” to zielony główny przycisk, „Obejrzane / Odłóż / Nie dla mnie” to zwarty pasek segmentowy, a ocena (4 przyciski) jest zwinięta pod jednym „Oceń”.
- Wysokości paneli w Kolejce, Zestawach i Książkach przeliczone pod dwa paski u góry. Obejrzane w Edge na kopii bazy (1440 i 1280 px, telefon 390 px). Nie sprawdzone: tablet 901–1100 px, ciemny motyw po zmianie struktury, Okładki/Etykiety w katalogu, Skan i Ustawienia pod nową nawigacją, `css-snapshot`.

## 2026-11-22 (212) — Rewolucja wizualna: poprawki po przeglądzie

- Górny pasek znów ma półprzezroczyste tło z rozmyciem (bez tego przewijana treść przechodziła pod tytułem). Gradient hero jest ciemniejszy na końcu, a tekst na nim ma pełną jasność (kontrast ≥ 4,5:1 także w ciemnym motywie); białe pigułki na hero mają własny ciemnozielony tekst. Wyłączony przełącznik w ustawieniach ma obwódkę. Na telefonie i ekranach dotykowych małe przyciski i filtry mają 44 px; przy „zmniejsz ruch” karty nie unoszą się. Nagłówek formularza Łowcy jest prawdziwym nagłówkiem (czytnik ekranu), nie tekstem z CSS.

## 2026-11-22 (211) — Rewolucja wizualna, cz. 3: bez szeryfów, Rynek jako karty, telefon

- Jedna rodzina pisma w całej aplikacji (tytuły książek bez szeryfów). Indeks rynku jako karty z niebieskim paskiem. Pusty Zapas jako karta z przerywaną ramką. Telefon: liczniki katalogu w jednym przewijanym wierszu zamiast czterech linii. Ciemny motyw obejrzany na komputerze (Dziś, Okazje): gradientowe hero i karty z kolorowymi paskami działają.

## 2026-11-22 (210) — Rewolucja wizualna, cz. 2: szczegóły książki, etykiety, ustawienia

- **Szczegóły książki** mają nagłówek-hero (zielony gradient, duża okładka, tytuł 30 px). **Etykiety** to kolorowe kafle (zielony / niebieski / bursztynowy pasek). W **Ustawieniach** pola zaznaczenia są przełącznikami (jak w telefonie). Obejrzane w Edge na kopii bazy (1280 px); telefon, ciemny motyw i `css-snapshot` nie sprawdzane dla tych elementów.

## 2026-11-22 (209) — REWOLUCJA wizualna: nowy język wyglądu

- **Nowa warstwa wyglądu** (`app/styles/design.css`, ładowana ostatnia): tło z miękką, kolorową poświatą; **pływający, zaokrąglony panel boczny** (karta z cieniem, nie przyklejony pasek); wyszukiwarka i przyciski jako pigułki; **główny przycisk z zielonym gradientem i poświatą**; pola z miękkim pierścieniem fokusu; zakładki jako pigułki z ciemną aktywną; karty o promieniu 22–28 px z lekkim cieniem zamiast ramek.
- **Dziś** to centrum dowodzenia: na górze duże zielone **hero z liczbą decyzji** (88 px) i białym przyciskiem „Weryfikuj”, pod nim Plan dnia jako karty z kolorowym paskiem (zielony okazje, bursztynowy decyzje, niebieski szybkie książki) i kolorowymi licznikami, potem kafle liczb z dużymi cyframi.
- **Okazje** to **galeria kart**: duża okładka (108×156), ogromna kwota oszczędności, wiersz akcji pod spodem; dwie kolumny na komputerze, jedna na telefonie.
- **Łowca** to jeden duży formularz-hero z dużym polem ISBN i białym przyciskiem.
- Akcje widoku w górnym pasku są teraz od 1181 px szerokości. Ciemny motyw ma własne gradienty i akcenty.
- Obejrzane w Edge na kopii bazy (komputer 1200/1280 px, telefon 390 px w ciemnym motywie). Nie sprawdzone: pozostałe widoki w nowym stylu (Książki — szczegóły, Skan, Ustawienia, Kolejka dopracowane tylko częściowo), `css-snapshot`, prawdziwy dotyk. Stare reguły obszarów zostają pod spodem (nadpisywane); sprzątanie to osobny krok.

## 2026-11-22 (208) — Przebudowa wizualna: poprawki po przeglądzie

- Akcje widoku w górnym pasku („Dodaj książkę”, „Nowy skan”) są tylko od 1400 px szerokości i przypięte (nie znikają przy przewijaniu); na węższych ekranach wracają na swoje poprzednie miejsce, bo pasek nie miał dla nich miejsca (zmierzone: bez nachodzenia na tytuł i wyszukiwarkę przy 1400 i 1600 px). Kolumna stanu w liście książek dopasowuje się do długości etykiety; pigułki filtrów nie przesuwają się po zaznaczeniu i mają zapasowy znacznik fokusu.

## 2026-11-22 (207) — Przebudowa wizualna, etap 3: ciemny motyw

- Ciemny motyw dostał tę samą chłodną paletę co jasny (granatowo-grafitowe tła zamiast zielonkawych) i własne kolory panelu bocznego (po zmianie jasnego panelu ciemny motyw odziedziczyłby ciemny tekst na ciemnym tle). Obejrzane w Edge (Okazje, Książki, Dziś, Kolejka, 1280 px); telefon w ciemnym motywie i `css-snapshot` nie sprawdzane.

## 2026-11-22 (206) — Przebudowa wizualna, etap 2: lista książek, widok Skan

- **Błąd:** w widoku Skan (od 1100 px) lista źródeł zajmowała jeden wiersz siatki, więc jej wysokość spychała formularz skanu pod listę, a lewa kolumna zostawała pusta (widać to było na zrzutach sprzed przebudowy). Teraz formularz stoi obok listy źródeł, a „Ostatni skan” pod nimi.
- Lista książek: wiersz w jednym rzędzie — okładka (większa) i opis po lewej, liczby wydań i ofert w równych kolumnach po prawej, stan („Niezweryfikowane”) na końcu; tytuły w tej samej czcionce co reszta (bez szeryfów). Usunięte hacki z „padding-right: 110px” i nakładającymi się licznikami. Na telefonie liczby i stan są pod opisem.
- Przycisk „Dodaj książkę” i podobne akcje widoku w górnym pasku także w katalogu (wcześniej tylko „Dziś”).
- Obejrzane w Edge na kopii bazy (1280 px i 390 px). Nie sprawdzone: ciemny motyw, tryb handlowy, `css-snapshot`.

## 2026-11-22 (205) — Przebudowa wizualna, etap 1: paleta, panel boczny, okazje

- **Wygląd:** nowa, chłodna paleta (jasnoszare tło zamiast beżu, świeższa zieleń marki), większe zaokrąglenia, delikatniejsze cienie. Panel boczny jest jasny, z podpisami przy ikonach od 1181 px szerokości (wcześniej od 1441 px), aktywna pozycja to miękka pigułka zamiast paska. Ciemny motyw bez zmian kolorów (panel boczny w nim został ciemny).
- **Układ przycisków:** przyciski akcji widoku („Dodaj książkę”, „Nowy skan”) są w górnym pasku obok wyszukiwarki, a nie w osobnym wierszu nad treścią. Filtry Okazji to pigułki (zaznaczona = zielona z ✓) zamiast zwykłych pól wyboru; na telefonie jeden wiersz przewijany w bok. Okazja to karta: tytuł (do 2 linii), liczby po prawej, a pod spodem wiersz akcji — „Kupiłem” jako główny przycisk, „Obejrzane / Odłóż / Nie dla mnie” cicho, ocena po prawej.
- Obejrzane na kopii bazy w Edge (komputer 1280 px i telefon 390 px), bez błędów JS; ciemny motyw, `css-snapshot` i prawdziwy dotyk nie sprawdzane. Dalsze etapy: lista książek, przyciski i formularze, ciemny motyw.

## 2026-11-22 (204) — Telefon: większe przyciski obserwowania

- Na telefonie „Obserwuj sprzedawcę”, „Obserwuj” na karcie paczki, „Pokaż wszystkie” i „Pokaż też droższe” mają co najmniej 44 px wysokości. Tylko CSS; nie oglądane na prawdziwym dotyku, `css-snapshot` nie uruchamiany.

## 2026-11-22 (203) — Okazje: bez ofert, których dawno nie widać

- **Błąd:** oferta „dostępna”, której skan nie widział od ponad 14 dni (np. ze źródła, którego już nie skanujemy), nadal mogła być okazją. W kopii Twojej bazy były to 3 z 202 okazji (2 z Dedalus, 1 z Vinted). Teraz oferty niewidziane 14 dni nie wchodzą do okazji ani do ich alertów.

## 2026-11-22 (202) — Paczki: tylko tańsze niż wycena

- Lista „Paczki sprzedawców” pokazuje domyślnie tylko paczki tańsze niż wycena; droższe są pod przyciskiem „Pokaż też droższe” (z liczbą), a licznik w nagłówku liczy tańsze. Na kopii Twojej bazy wszystkie 21 paczek były droższe niż wycena, więc lista była samym szumem. Dane z serwera bez zmian. Nie oglądane w przeglądarce po zmianie.

## 2026-11-22 (201) — Sprawdzian wycen: gdzie wycena myli się najbardziej

- „Jak trafne są wyceny” ma dwie dodatkowe tabele: według wartości samej wyceny (do 15, 15–30, 30–60, od 60 zł) i według tego, czy wycenę wspierała potwierdzona sprzedaż. Na kopii Twojej bazy (163 próby): wyceny oparte na potwierdzonej wcześniejszej sprzedaży trafiają w pas 0,8–1,2 w 59% przypadków, bez niej w 31% (105 prób). Wyceny poniżej 15 zł są najbardziej rozrzucone: w pasie tylko 4% (23 próby), a ceny sprzedaży to średnio 1,46× wyceny. Podział po cenie, za jaką książka się sprzedała, byłby błędny (wybiera po wyniku, więc tanie sprzedaże zawsze wyglądałyby na przewartościowane), dlatego tabela idzie po wycenie. Sprawdzone też, że współczynnik ceny ofertowej (obecnie 0,9) jest blisko optimum na tych danych (0,8–1,0 daje medianę 1,08–0,95, w pasie 36–42%); nic w liczeniu wyceny nie zmieniono. Tylko odczyt.

## 2026-11-22 (200) — Pierwszy przegląd na kopii bazy; Paczki: „drożej o”

- Nowe ekrany obejrzane na kopii Twojej bazy (Okazje z „Prawie okazje”, Paczki, Rynek z „Oknem przewagi” i sprawdzianem wycen, Zapas; komputer i telefon 390 px): bez błędów JS. **Błąd:** paczka sprzedawcy droższa niż wycena pokazywała „oszczędność -2,00 zł”; teraz „drożej o 2,00 zł” (w kopii wszystkie 21 paczek są droższe niż wycena). Wyniki z kopii: „Prawie okazje” 15 ofert (709 zaobserwowanych obniżek w całej bazie; ale tylko 2,2% ofert Vinted kiedykolwiek obniżyło cenę, 6,6% wśród starszych niż 14 dni — sygnał jest słaby), „Okno przewagi” za mało danych (26 okazji, 17 bez czasu wystawienia), sprawdzian wycen: mediana ceny sprzedaży do wyceny 1,03, ale w pasie 0,8–1,2 tylko 41% ofert (wysoka pewność 76%, średnia 41%, niska 31%).

## 2026-11-22 (199) — Okazje: „Prawie okazje” (po zwykłej obniżce)

- Pole „Prawie okazje (po zwykłej obniżce)” w Okazjach pokazuje oferty, które nie są jeszcze okazją, ale byłyby nią po obniżce takiej, jaką sprzedawcy zwykle robią (mediana wszystkich obserwowanych obniżek z historii cen; potrzeba co najmniej 30 takich zdarzeń, podpowiedź nie schodzi poniżej 0,6 ceny). Tylko oferty wiszące co najmniej 14 dni albo już raz obniżone; przy ofercie: „obniżona 2 razy, ostatnio −15%; po zwykłej obniżce (ok. 28 zł) byłaby okazją”. To podpowiedź do własnej propozycji ceny, nie cena docelowa; nie jest to alert ani zmiana rankingu okazji (osobna lista, domyślnie ukryta). Nie oglądane w przeglądarce ani na prawdziwych danych; na kopii Twojej bazy zmierzono: obniżyło cenę 2,2% ofert Vinted (6,6% wśród starszych niż 14 dni), więc lista jest wąska (ok. 15 ofert).

## 2026-11-22 (198) — Okazje: „zwykle odrzucasz”

- Gdy z ostatnich 90 dni odrzucasz okazje tego samego wydawcy lub sprzedawcy wyraźnie częściej, niż kupujesz (co najmniej 8 decyzji, np. 12 z 14; 3 z 3 nie wystarcza), okazja dostaje znacznik „zwykle odrzucasz: wydawca X (12 z 14)”. Pole „Ukryj zwykle odrzucane” (domyślnie wyłączone) chowa je z listy. Zakupy w Zapasie i oceny „dobra” liczą się jako głosy przeciw. Znacznika nie dostają oferty z Twoim celem „Kupuję do” ani od obserwowanego sprzedawcy; kolejność okazji bez zmian. Tylko znacznik — żadne reguły wyciszania nie powstają same. Nie oglądane w przeglądarce ani na prawdziwych danych; nie sprawdzono na kopii bazy, czy odrzucenia skupiają się na kilku cechach (jeśli są rozproszone, znacznik prawie nigdy się nie pojawi).

## 2026-11-22 (197) — Okno przewagi

- W „Rynku” zwijana sekcja „Okno przewagi”: mediana minut od wystawienia oferty do ogłoszenia okazji oraz czas życia okazji (połowa i 75% tych, które zniknęły). Oferty wciąż aktywne są liczone osobno (czas życia „co najmniej”), oferty bez czasu wystawienia też; poniżej 30 okazji „za mało danych”. Tylko odczyt, bez migracji i bez żądań; nie zmienia snajpera ani rankingu. Nie oglądane w przeglądarce ani na prawdziwych danych — nie wiadomo jeszcze, czy ogłoszone okazje mają wypełniony czas wystawienia.

## 2026-11-22 (196) — Obserwowany sprzedawca

- „Obserwuj sprzedawcę” przy okazji i „Obserwuj” na karcie paczki (migracja 147). Oferta obserwowanego sprzedawcy trafia do listy Okazji już wtedy, gdy jest poniżej dolnej granicy wyceny, choćby mniej niż o 20% i 5 zł (tylko na tej liście: alerty snajpera, plan dnia, statystyki fraz i eksport mają zwykłe progi), z plakietką „obserwowany”; pole „Tylko od obserwowanych sprzedawców” filtruje listę. Obserwacja nie zmienia kolejności innych okazji i nie wysyła żadnych żądań — widać tylko oferty, które skan i snajper i tak pobrały. Oferta bez id sprzedawcy nie ma przycisku. Nie oglądane w przeglądarce; nie zmierzono, czy obserwowanie ma sens (czy sprzedawcy z okazjami wystawiają kolejne) — to wymaga kopii Twojej bazy.

## 2026-11-22 (195) — Zapas: co przyniosło towar

- „Kupiłem” zapisuje teraz, jaka fraza i który sprzedawca przyniósł ofertę (zrzut w sztuce, więc zostaje, gdy oferta zniknie; migracja 146, starsze sztuki uzupełnione z oferty, o ile jeszcze istnieje). W Zapasie zwijana sekcja „Co przyniosło towar”: frazy i sprzedawcy z liczbą kupionych, sprzedanych i medianą dni do sprzedaży; poniżej 5 sztuk w grupie „za mało danych”, bez kwot. Oferta znaleziona kilkoma frazami liczy się do pierwszej z jej listy w chwili „Kupiłem”. Nie oglądane w przeglądarce ani na prawdziwych danych; wartość pojawi się po kilku tygodniach używania Zapasu.

## 2026-11-22 (194) — Etykiety: bez martwych filtrów; większe przyciski na dotyk

- W widoku katalogu **Etykiety** znikły sortowanie, „Tylko niekompletne” i „Filtry katalogu” (nic tam nie robiły); zostaje wyszukiwarka. Na urządzeniach bez myszy przyciski „×” i etykiety przy książkach mają 44 px (było 28), a menu etykiet jest przesunięte, żeby ich nie zakrywać. Tylko CSS; nie oglądane w przeglądarce ani na prawdziwym dotyku, `css-snapshot` nie uruchamiany.

## 2026-11-22 (193) — Okładki: przeciąganie i poprawka kolejności etykiety

- **Błąd:** w widoku Okładki z wybraną etykietą książki szły alfabetycznie zamiast w kolejności etykiety, jeśli nazwa etykiety zawierała małą literę „s” (np. „Kroniki szeptów”) — nazwa była źle normalizowana (błąd z wpisu 191). **Błąd:** przełączenie z Listy na Okładki nie odświeżało listy, więc po wyborze etykiety w Liście zostawała stara kolejność. Oba naprawione, z testem.
- **Okładki:** przy wybranej etykiecie przeciągnij okładkę na inną, aby **zamienić je miejscami** (zapis w kolejności etykiety, z „Cofnij”). Klawiatura: Ctrl+←/→ na okładce; telefon: przyciski ←/→; każda okładka ma numer miejsca, zmiany ogłasza czytnik ekranu. Gdy przeciąganie jest wyłączone (brak etykiety, inne sortowanie, aktywne filtry), nad okładkami jest zdanie wyjaśnienia. Działa tylko, gdy załadowana jest cała etykieta.
- **Etykiety:** w liście etykiet i wewnątrz etykiety jest „Układaj okładki” (otwiera katalog w widoku Okładki z tą etykietą). Lista książek etykiety z ↑↓ i przeciąganiem zniknęła; numer tomu i usuwanie książki z etykiety są w zwiniętej sekcji „Książki i numery tomów”, reszta (nazwa, „Ułóż według tomów”, Rynek, cel zbiorczy, dodawanie) bez zmian. Sprawdzone w Edge na izolowanej bazie (przeciąganie, klawiatura, cofnięcie, błąd zapisu, emulacja dotyku 390 px); prawdziwy dotyk, czytnik ekranu i `css-snapshot` nie. Przycisk „Układaj okładki” na liście etykiet wygląda na luźno przypięty pod kartą.

## 2026-11-22 (192) — Poprawki układu na telefonie (po audycie w przeglądarce)

- Nowe ekrany obejrzane po raz pierwszy na danych testowych (telefon 390 px i komputer 1280 px, jasny i ciemny motyw; ok. 100 zrzutów). **Błąd:** zakładki Okazji („Snajper”) były ucięte — teraz zawijają się do drugiego wiersza. **Błąd:** tabela „Jak trafne są wyceny” wystawała poza ekran — teraz przewija się w panelu. **Błąd:** pasek sum w Łowcy z „Kupiłem zaznaczone” chował się pod dolnym paskiem nawigacji (poprawka nie oglądana w działaniu). **Błąd:** długa etykieta przy książce nachodziła na liczbę wydań i ofert. Zapas: znacznik obniżki wyróżniony kolorem, tytuł sztuki wyrównany. Telefon: linki planu dnia i „ogłoszenie ↗”, „Obniżyłem cenę” i podsumowania „bez legalnego dostępu” oraz „Centrum skanowania” mają co najmniej 44 px. Koniec z błędem 404 przy ładowaniu ikony strony.
- Nie naprawione: przyciski „×” i etykiety przy okładkach na telefonie mają 28 px; w trybie Etykiety katalog nadal pokazuje filtry listy, które tam nic nie robią. Porównanie stylów (`css-snapshot`) przejrzano tylko częściowo (pierwsze 60 różnic, wszystkie w zmienionych selektorach); ciemny motyw i tryb handlowy poza zakresem. Karta „Ostatnie 7 dni” była zwinięta, więc jej zawartości nie obejrzano.

## 2026-11-22 (191) — Okładki sortowane według tomów etykiety

- W widoku **Okładki**, gdy w filtrach wybrana jest etykieta, książki układają się w kolejności tej etykiety (tom 1, 2, 3 — tak, jak ułożyłeś je w Etykietach), a nie alfabetycznie. W liście „Sortowanie katalogu” jest też opcja **Kolejność etykiety (tomy)** do ręcznego wyboru (działa także w widoku listy). Wybranie innego sortowania ręcznie zostaje; nowa etykieta zaczyna znów od własnej kolejności. Bez wybranej etykiety (albo przy „Bez etykiety”) opcja działa jak A–Z. Nie oglądane w przeglądarce.

## 2026-11-21 (190) — Poprawki Przeglądu okazji i backtestu wycen

- Komunikaty akcji w „Przeglądzie” (także błędy i „Nie ma czego cofać”) są widoczne jako toast i nie są zamazywane opisem kolejnej karty. Akcja kończąca się po zamknięciu i ponownym otwarciu Przeglądu nie psuje nowej kolejki. Po wyborze etykiety fokus wraca na panel, Esc działa także z listy etykiet, skróty milczą przy otwartej szufladzie oferty. **Błąd:** backtest wycen czytał historię cen wszystkich ofert i liczył się w kółko; teraz bierze tylko wydania ze sprzedażą w oknie, szuka cen binarnie i jest cache'owany do minuty (3000 ofert: 174 → 101 ms, wynik bez zmian). **Błąd:** oferta sprzedana lub niedostępna bez czasu zmiany liczyła się jako żywa cena; teraz jest pomijana. **Błąd:** profil snajpera zapisany starą metodą jest przeliczany przy najbliższym skanie, nie dopiero po dobie.

## 2026-11-21 (189) — Rynek w etykiecie

- W widoku etykiety przycisk **Rynek** pokazuje dla każdej książki najtańszą dostępną polską ofertę (cena, źródło, link, wycena, o ile taniej) albo „brak ofert” oraz luki w Twojej numeracji tomów (są 1, 2, 4 → brakuje 3; tylko między numerami nadanymi ręcznie, bez procentu kompletności). „Skanuj brakujące” wstawia frazy książek bez oferty do pola skanu (skanu nie uruchamia). Pole „Kupuję do … zł (każda książka)” ustawia jeden cel dla wszystkich książek etykiety (zastępuje wcześniej ustawione cele tych książek). Bez migracji; to narzędzie do kupowania, nie lista braków. Panel nie był oglądany w przeglądarce ani na prawdziwych danych; jeśli mniej niż 30% tomów w Twoich etykietach ma ofertę z wyceną, widok będzie w praktyce pustą tabelą.

## 2026-11-21 (188) — Snajper: profil napływu liczony na skan (poprawka po pomiarze)

- **Błąd:** profil napływu („Dopasuj do godzin napływu”) liczył oferty według czasu własnego skanu, nie ogłoszenia. W pomiarze na kopii Twojej bazy 91,7% ofert wpadło w 5 wieczornych godzin (tam skanujesz), więc widoczny stosunek szczyt/noc 38× był artefaktem Twoich zwyczajów, nie rynku. Teraz oferty są liczone na godzinę skanowania (z historii skanów); godziny skanowane w mniej niż 3 godzinach okna 28 dni są „nieznane” i dostają odstęp bazowy (ani 60 min, ani krócej), a profil powstaje dopiero, gdy skany pokrywają co najmniej połowę godzin tygodnia. Inaczej snajper działa jak zwykle, a ekran mówi „Za mało skanów w różnych porach”. Budżet tygodniowy nadal nie przekracza stałego odstępu, granice 15–60 min. Przy obecnych wieczornych skanach adaptacja może się długo nie włączać; żeby poznać prawdziwy napływ, trzeba kilkunastu dni równomiernych skanów (np. co 30 min całą dobę).

## 2026-11-21 (187) — Szukaj: sprzedawcy bez nazwy i szybsze karty

- Vinted nie podaje nazw sprzedawców (w kopii bazy pusta nazwa dla 6561 z 6561 ofert), więc sprzedawca bez nazwy jest teraz „Sprzedawca #id” i znajdziesz go tylko po pełnym numerze. Karty autorów i serii liczą się zbiorczo, z podręcznym modelem obrotu (do 60 s): ciepłe 8–46 ms, zimne ok. 28–90 ms na 10 tys. ofert (poprzednio 43 ms spokojnie, 93–118 ms pod obciążeniem). Wyniki te same (test porównujący przed i po).

## 2026-11-21 (186) — „Jak trafne są wyceny” w Rynku

- Sekcja w „Rynku” (`GET /api/valuation/backtest`, tylko odczyt): dla ofert sprzedanych w ostatnich 90 dniach porównuje ostatnią cenę z wyceną wydania sprzed sprzedaży, bez danych z późniejszego czasu. Pokazuje liczbę prób, medianę stosunku cena/wycena, środek rozkładu (25–75%) i odsetek w paśmie 0,8–1,2, osobno dla wycen wysokiej, średniej i niskiej pewności. Poniżej 20 prób w grupie: „za mało danych”, bez liczb. Nie uruchamiane na prawdziwych danych; brak plakietki pewności przy okazji.

## 2026-11-21 (185) — Okazje: tryb „Przegląd”

- Przycisk **Przegląd** w Okazjach pokazuje okazje jedna po drugiej z licznikiem („3 z 12”), ceną, wyceną, oszczędnością i linkiem. Skróty: **K** kupiłem (do Zapasu), **L** do wybranej etykiety, **O** odłóż, **N** nie dla mnie, **S** pomiń, **Z** cofnij ostatnią akcję, **Esc** zamknij; te same akcje są przyciskami na telefon. Oferta bez przypisanego wydania dostaje ten sam komunikat co przy „Kupiłem” na liście. Bez kwot i zysku. Akcje nie były klikane na prawdziwych danych (tylko testy czystych funkcji i otwarcie na pustej bazie).

## 2026-11-21 (184) — Skan: „Szukaj po etykiecie”; sprzątanie po widoku serii

- Pole „Szukaj po serii” w skanerze to teraz **„Szukaj po etykiecie”**: wybór etykiety zastępuje frazy listą tytułów jej książek (tytuł i autor, w Twojej kolejności; limit 200 fraz). Dotychczasowe listy (Świat Dysku, Herezja Horusa, Gotrek i Felix, uniwersa) są w grupie „Gotowe serie”. Usunięto 47 nieużywanych selektorów `.series-*` i `.shelf-*` z CSS. Porównanie stylów (`css-snapshot` dla katalogu i skanera, pusta baza): katalog bez różnic, w skanerze dłuższa notka pod polem zawija się do 2 linii (19,5 → 39 px). Pełny snapshot i prawdziwe dane nie były sprawdzane.

## 2026-11-21 (183) — Zapas: poprawki przypomnienia o obniżce

- „Zostaw” nie wraca już przez drobne wahania ceny rynkowej (zmiana poniżej 1 zł lub 5%). Data obniżki z przyszłości nie wycisza przypomnienia. Sugestia to zawsze cena „szybkiej sprzedaży”; usunięto martwy komunikat „cena jest już niska”. Przy kalibracji dopisano, że indeks to dzisiejszy model rynku. **Błąd:** nieoczekiwane błędy karty wystawienia były połykane po cichu, teraz trafiają do logu. Doszedł test end-to-end z ofertami Vinted.

## 2026-11-21 (182) — Łowca: „Kupiłem zaznaczone” → Zapas

- W sesji w sklepie przy książkach z „Biorę” jest przycisk **Kupiłem** i zbiorczy **Kupiłem zaznaczone (N)** na pasku sumy. Tworzy sztuki „kupione” w Zapasie, wydanie rozpoznawane po ISBN (`POST /api/stock/batch`). Pozycje bez wydania w katalogu są pominięte z komunikatem (dodaj ISBN w Kolejce), reszta partii się zapisuje. „Cofnij” w toaście cofa dokładnie te sztuki; wiersz ma znacznik „W zapasie”. Bez kwot. Nie klikane w żywym UI, tylko testy jednostkowe.

## 2026-11-21 (181) — Zapas: przypomnienie o obniżce i kalibracja szansy

- Sztuka wystawiona dłużej, niż wynosi mediana czasu sprzedaży wydania w indeksie rynku, dostaje w Zapasie znacznik „leży N dni, przewidywane M; sugerowana obniżka do X zł” (cena z progu „szybka sprzedaż” karty wystawienia; tylko podpowiedź, nic nie jest liczone jako zysk ani koszt). „Obniżyłem cenę” zapisuje samą datę i wycisza przypomnienie na 7 dni, „Zostaw” wycisza je do zmiany ceny rynkowej; bez wiarygodnej wyceny widać „za mało ofert”. W nagłówku Zapasu „twoja szansa sprzedaży w 30 dni vs indeks” z przedziałem i liczbą prób — dopiero po 20 sprzedanych sztukach (wcześniej „za mało danych”). Migracja 145. Wygląd znacznika nie był oglądany; cena sztuki nie jest przechowywana, więc „bieżącą” zastępuje próg środkowy.

## 2026-11-21 (180) — Etykiety i szukanie: poprawki po przeglądzie

- **Błąd:** po scaleniu etykiet z lukami w kolejności dopisane książki mogły wskoczyć w środek, a usunięcie książki z etykiety przez edytor książki zostawiało dziury w numeracji; teraz kolejność to zawsze 1…n, a usunięcie z etykiety jest jedną transakcją. **Błąd:** starsza odpowiedź w „Szukaj” lub w „Etykietach” mogła nadpisać nowszą albo otworzyć panel po jego zamknięciu. **Błąd:** po usunięciu oferty „Szukaj” mógł jeszcze pokazywać jej sprzedawcę. Kopia własnych serii do etykiet nie zlewa po cichu serii różniących się dopiero po 60. znaku (zlania są liczone).

## 2026-11-21 (179) — Szukaj sprzedawców, autorów i serii

- Nowe pole **Szukaj** u góry (klawisz `/`, także w palecie poleceń) znajduje sprzedawców, autorów i serie wydawnicze bez względu na wielkość liter i polskie znaki. Karta sprzedawcy: aktywne oferty z wycenami, ile zniknęło w 30 dni, mediana odchylenia ceny od wyceny (oferty bez wiarygodnej wyceny są na liście, ale poza medianą). Karta autora lub serii: obrót wg indeksu rynku, liczba żywych ofert, mediana ceny. Tylko odczyt, bez kosztów i zysku, bez list brakujących tomów. Migracja 144 (indeks sprzedawców). Na 100 tys. ofert ok. 30–50 ms, zimny start ok. 60 ms. Wygląd panelu i klawisz `/` nie były oglądane w przeglądarce; wynik na Twojej bazie nie był sprawdzany.

## 2026-11-21 (178) — Zapas: poprawki po przeglądzie

- „Wystawiłem” bez czekającej sztuki nie liczy sztucznego 0 dni do mediany kupno → wystawienie. „Cofnij” w komunikacie cofa dokładnie tę zmianę; jeśli sztuka została przesunięta, nic się nie cofa i widać komunikat. Cofnięcie zakupu ukrywa sztukę (dziennik zostaje), ofertę można kupić ponownie; przyciski blokują się na czas żądania. „Sprzedane w 30 dni” nie liczy odpuszczonych bez sprzedaży. **Błąd:** podwójne cofnięcie przy sztuce dodanej przez „Wystawiłem”. Stare sztuki dodane tą drogą przed poprawką nadal mają zaniżoną medianę.

## 2026-11-21 (177) — Etykiety jako własne kolekcje (zastępują widok „Serie”)

- Katalog → **Etykiety**: lista Twoich etykiet z liczbą książek, „Nowa etykieta” (pusta kolekcja), zmiana nazwy (istniejącą nazwę scalasz po potwierdzeniu) i usuwanie (książki zostają w katalogu). Wewnątrz etykiety układasz książki w swojej kolejności: ↑ ↓ z klawiatury lub przeciąganie, numer tomu, „Ułóż według tomów”, dodawanie z wyszukiwarki katalogu, × usuwa z etykiety. Migracja 143. Dotychczasowe własne serie zostały raz skopiowane do etykiet w kolejności tomów (oryginały zostają w bazie, ale nie widać ich w interfejsie). Skan „Szukaj po serii” bez zmian (stałe listy). To świadome odstępstwo od „bez funkcji kolekcjonerskich” na Twoją prośbę; etykiety to organizacja, nigdy dowód ISBN. Przeciąganie, telefon i prawdziwa baza nie były sprawdzane.

## 2026-11-21 (176) — Raport „Ostatnie 7 dni” w Dziś

- W „Dziś” jest rozwijana karta z podsumowaniem ostatnich 7 pełnych dni (czas warszawski): skany, nowe oferty ze źródeł, okazje ogłoszone i obejrzane z medianą reakcji, skrzynka okazji, źródła z cichym spadkiem lub błędami, szumiące frazy, rozliczone prognozy i zapas (gdy coś się w nim działo). Strzałka zmiany względem poprzedniego tygodnia tylko wtedy, gdy ten tydzień ma dane; sekcje bez danych są pomijane, nie pokazują zer. Wersja tekstowa z „Kopiuj tekst” (`GET /api/report/week?to=RRRR-MM-DD`); w poniedziałek karta jest otwarta, dopóki jej raz nie przeczytasz. Tylko odczyt. Nie oglądane na prawdziwych danych ani na telefonie; brak sekcji „świeżość kopii”.

## 2026-11-21 (175) — Zapas: kupione → wystawione → sprzedane (bez kwot)

- Nowa podzakładka **Zapas** w grupie Łowca (migracja 142): trzy kolumny (Kupione, Wystawione, Sprzedane) z wiekiem sztuki w dniach, przyciski „Wystawiłem”, „Sprzedałem”, „Odpuszczam”, „Cofnij”. Nagłówek: mediany dni kupno→wystawienie i wystawienie→sprzedaż oraz „sprzedane w 30 dni: N z M” (brak danych to „-”). „Kupiłem” przy okazji, „Wystawiłem” w panelu Wystaw. Tylko stany i daty, bez kwot, kosztów i zysku; sztuka powstaje tylko dla książki z przypisanym wydaniem. Nie zrobione: wejście z sesji Łowcy („Kupiłem zaznaczone”). Przyciski nie były klikane w przeglądarce, tylko testowane jednostkowo.

## 2026-11-21 (174) — Snajper dopasowany do godzin napływu i narzędzia danych w Ustawieniach

- W „Okazje → Snajper” jest przełącznik **Dopasuj do godzin napływu**: odstęp między skanami jest krótszy w godzinach, w których zwykle pojawia się najwięcej ogłoszeń, a dłuższy w ciszy (tabela 7×24 pokazuje odstęp dla każdej godziny tygodnia). Przy mniej niż 14 dniach historii albo 200 ofertach snajper działa jak dotąd i mówi o tym wprost.
- W „Ustawienia → Dane i kopie zapasowe”: **Pobierz CSV okazji**, **Pobierz CSV fraz** i **Sprawdź ostatnią kopię** (rozmiar, liczba tabel i wierszy albo czytelny powód, że kopia jest zła). Nie oglądane w przeglądarce poza testem ładowania widoków; siatka na telefonie i w ciemnym motywie nie była sprawdzana.

## 2026-11-21 (173) — Nawigacja w grupach z podzakładkami

- Pasek boczny ma 7 grup zamiast 9 pozycji; wewnątrz grupy widać pasek podzakładek, a ostatnio użyta podzakładka jest pamiętana. Etykiety i adresy `?view=…` zostały. Na telefonie dolny pasek ma 5 miejsc, a „Więcej” otwiera listę (Książki, Skan, Ustawienia). Przejście przez „Okazje” nie ładuje już czterech paneli naraz.
- **Błąd (znaleziony w przeglądzie):** przyciski listy „Więcej” dostawały kolejny handler przy każdej zmianie widoku (klik wykonywałby się wielokrotnie). Rejestracja jest teraz jedna. Test przeglądarkowy (Edge, pusta baza) przechodzi; układ na prawdziwych danych i telefonie nie był oglądany.

## 2026-11-21 (172) — Eksport CSV i sprawdzanie kopii (zaplecze)

- Okazje i frazy skanu pobierzesz jako CSV pod `/api/export/deals.csv` i `/api/export/phrases.csv` (średnik, przecinek dziesiętny, polskie znaki, ceny w zł; nieznana cena to puste pole, nie 0; tytuły zaczynające się od `=`, `+`, `-`, `@` są zabezpieczone przed uruchomieniem jako formuła). `POST /api/data/backup/verify` sprawdza kopię z folderu `backups` (najnowszą albo wskazaną): integralność, liczba tabel, wykrycie ucięcia pliku. Kopia automatyczna działała już wcześniej. Interfejs („Ustawienia, Dane”) dojdzie osobno; CSV nie był otwierany w prawdziwym Excelu.

## 2026-11-21 (171) — Snajper: odstęp dopasowany do godzin napływu ofert (backend)

- `PUT /api/sniper` przyjmuje `adaptive: true` („Dopasuj do godzin napływu”, domyślnie wyłączone). Wtedy odstęp między przebiegami snajpera zależy od godziny tygodnia, w której był poprzedni przebieg: z historii ostatnich 28 dni liczony jest napływ nowych ofert na każdą z 168 godzin (czas lokalny), a odstęp wynosi od 15 min w szczycie do 60 min w nocy, w proporcji do napływu. **Tygodniowa liczba skanów nigdy nie przekracza tej przy stałym odstępie** (gdyby proporcja ją przekraczała, całość zwalnia). Przy mniej niż 14 dniach historii albo mniej niż 200 ofertach każdy odstęp jest bazowy, czyli jak dotąd. Profil odświeża się raz na dobę; wyłączenie go kasuje. Limity i bramka źródeł bez zmian. `GET /api/sniper` zwraca `adaptive` i `profile` (168 odstępów, na czym się opierają). Przełącznik w interfejsie dojdzie osobnym wpisem; działanie na Twoich danych (czy szczyt i noc różnią się co najmniej dwukrotnie) trzeba jeszcze sprawdzić.
- **Błąd:** profil napływu mógł zostać zdominowany przez jedną godzinę, gdy pierwszy duży skan lub import wpadał w jedną godzinę. Teraz wkład jednej godziny kalendarzowej jest ograniczony (do 2× mediany niepustych godzin, nie więcej niż 50 ofert), a sam import nie wystarcza, by uznać historię za wystarczającą. Budżet skanów tygodniowo nadal nie przekracza stałego odstępu. Dodano testy odświeżania profilu po 24 h, wyłączania trybu adaptacyjnego i `/api/sniper`.

## 2026-11-21 (170) — Karta „Paczki sprzedawców” w Okazjach; poprawki po przeglądzie

- W **Okazjach**, pod „Moje ceny docelowe”, jest zwijana sekcja **Paczki sprzedawców (N)**: sprzedawca, liczba książek, razem cena, wycena i oszczędność, trzy pierwsze oferty z linkami (przycisk „Pokaż wszystkie”); przy braku paczek jedna linia. Tylko cena wobec wyceny. Wygląd na prawdziwych paczkach nie był oglądany.
- **Błąd (paczki):** wycena oferty w paczce uwzględniała samą tę ofertę, więc sprzedawca z kilkoma tanimi książkami „poprawiał” własną próbkę. Teraz wycena liczona jest bez własnej oferty, jak w Okazjach.
- **Błąd (cele cenowe):** ponowne zapisanie ceny celu bez pola „active” po cichu włączało wyłączony cel. Teraz edycja ceny zachowuje stan.
- **Błąd (karta wystawienia):** przy wydaniu bez własnej sprzedaży wszystkie trzy ceny miały „0% szans”; teraz „brak oszacowania szans”. Konkurencja pomija zestawy i oferty oznaczone jako „zła zgodność”.

## 2026-11-21 (169) — „Kupuję do … zł” w interfejsie

- W szczegółach **wydania** i **książki** (dzieło: „Dla polskich wydań tej książki”) jest sekcja **Kupuję do (zł)**: pole ceny (przecinek lub kropka, 0,01–9999,99), „Zapisz”, „Wyłącz / Włącz” i linia stanu („Cel: 15,00 zł — aktywny” / „Brak celu”). „Zapisz” na wyłączonym celu zmienia tylko cenę, cel zostaje wyłączony, dopóki nie klikniesz „Włącz”. W **Okazjach** oferta z celem ma znaczek „Twoja cena ≤ X zł”, a nad listą jest zwijana lista „Moje ceny docelowe” z wyłączaniem. Przeszedł test przeglądarkowy (Edge, pusta baza, z krokiem ustawienia celu); wygląd chipa i listy na prawdziwych okazjach, na telefonie i w ciemnym motywie nie był oglądany.

## 2026-11-21 (168) — Paczki sprzedawców (odczyt)

- Nowy odczyt `GET /api/seller-bundles`: sprzedawcy Vinted, którzy mają co najmniej 3 dostępne książki o wiarygodnej wycenie (wysoka lub średnia pewność), z sumą ich cen, sumą wartości, różnicą i listą ofert od największej oszczędności; sprzedawcy od największej sumy. Nie liczą się: sprzedane i niedostępne, zestawy, oferty oznaczone przez Ciebie jako „zła zgodność” i oferty bez numeru sprzedawcy (nie łączą się w paczkę). Tylko porównanie ceny z wyceną, bez kosztów i zysku, bez kontaktu ze sprzedawcą. Nie mierzone na Twoich danych: roadmapa zakładała, że funkcja odpada, jeśli mniej niż 15% oszczędności leży w paczkach, więc po podłączeniu widoku warto to sprawdzić. Karta w „Okazjach” dojdzie osobnym wpisem.

## 2026-11-21 (167) — Przycisk „Wystaw”: karta wystawienia w szczegółach wydania

- W szczegółach wydania (Książki) przycisk **Wystaw** rozwija panel: wybór stanu (Nowa / Bardzo dobry / Dobry / Zadowalający), trzy ceny (szybka sprzedaż / środek / cierpliwie) z orientacyjną szansą sprzedaży w 30 dni, zdanie o konkurencji („N ofert teraz, najtańsza …, mediana …”), gotowy tytuł i opis do Vinted z przyciskami „Kopiuj tytuł” i „Kopiuj opis” (gdy schowek odmówi, tekst zostaje zaznaczony do ręcznego skopiowania). Przy za małej liczbie ofert zamiast ceny jest „Za mało ofert tego wydania, żeby podać cenę”. Obejrzane w teście przeglądarkowym na pustej bazie (głównie wariant „za mało ofert”); układ na prawdziwych danych nie był oglądany.

## 2026-11-21 (166) — „Kupuję do … zł”: cena docelowa (backend)

- Nowa tabela `price_targets` (migracja 141) i moduł `price-targets.mjs`: dla wydania albo dla dzieła (wtedy obejmuje jego polskie wydania, nigdy obce) można ustawić najwyższą cenę, jaką jesteś gotów zapłacić — `PUT /api/price-targets` `{editionId | workId, maxPrice w groszach}`, `GET /api/price-targets`, `PUT /api/price-targets/:id/active` (wyłączenie zostawia cel i wszystkie ogłoszone alerty). Oferta w tej cenie lub niższej, dostępna, trafia do okazji z etykietą „Twoja cena (cel z ustawień)” **niezależnie od wyceny rynkowej** (wartość = Twoja cena, oszczędność = różnica), więc działa dla książek bez rynku; oferta, która już jest okazją, dostaje tylko znacznik `target`. Ogłoszenie (alert, skrzynka, plan dnia) idzie raz, jak przy innych okazjach; cena od 10 000 zł i nieznana nie liczy się. To porównanie ceny z liczbą, którą wybrałeś; bez kosztów i zysku. Pole „Kupuję do” w interfejsie dojdzie osobnym wpisem.

## 2026-11-21 (165) — Po obejrzeniu w przeglądarce: dolna nawigacja i Łowca

- **Błąd:** po dodaniu zakładek Łowca i Frazy dolna nawigacja na telefonie zawijała się do dwóch rzędów i zasłaniała dół strony (w teście przeglądarkowym przycisk kolejki był pod nią). Teraz to jeden rząd, który przewija się w bok, gdy pozycji jest więcej.
- **Błąd:** Łowca pokazywał „0% szans na sprzedaż w 30 dni · schodzi wolno” dla książki bez żadnej własnej sprzedaży, czyli jakby to był pomiar. Teraz jest „brak danych” (odpowiedź `/api/hunter` niesie `liquidity.basis`).
- Widoki Dziś, Łowca, Frazy i Okazje obejrzane po raz pierwszy w przeglądarce (Edge, telefon 390 px i komputer 1280 px, pusta baza). `scripts/browser-smoke.mjs` obejmuje teraz też Łowcę i Frazy, a oba skrypty przeglądarkowe uruchomią zainstalowany Edge, gdy ustawisz `BOOKFLIP_BROWSER_CHANNEL=msedge` (Chromium z Playwrighta nie daje się tu pobrać).

## 2026-11-21 (164) — Widok „Frazy”

- Nowa zakładka **Frazy** (nawigacja boczna, dolna na telefonie, paleta poleceń): tabela, a na telefonie karty, fraz skanu z nowymi ofertami z 14 dni, okazjami, udziałem ofert bez ISBN, ostatnim widzeniem i werdyktem (tekst i ikona: „szum”, „OK”, „za mało danych”). Przycisk „Wyłącz” / „Włącz” (odwracalny, z toastem „Cofnij”) działa na skany z harmonogramu; opis w widoku przypomina, że skan wpisany ręcznie robi dokładnie to, co wpisano. Filtr „Wszystkie / Tylko szum / Wyłączone” i podsumowanie („4 frazy, 1 szumiąca, 1 wyłączona”). Wygląd nie był oglądany w przeglądarce; dolna nawigacja ma teraz więcej pozycji i na wąskim ekranie warto ją obejrzeć.

## 2026-11-21 (163) — Karta wystawienia (odczyt): ceny i opis na Vinted

- Nowy odczyt `GET /api/editions/:id/listing-card?condition=good` dla wydania: trzy ceny w pełnych złotych, rosnące ściśle (szybka sprzedaż 85%, środek 100%, cierpliwie 120% wyceny), każda z **orientacyjną** szansą sprzedaży w 30 dni (z dotychczasowej sprzedaży wydania i założonej wrażliwości na cenę, nie z zmierzonej krzywej), liczba ofert konkurencji na Vinted teraz z najtańszą i medianą, oraz gotowy tytuł i opis do wklejenia (autor, tytuł, wydawnictwo, rok, ISBN i stan; pola, których nie ma w katalogu, są pomijane, a stan zostaje „[uzupełnij]”, jeśli go nie podano). Gorszy stan obniża ceny. Przy braku wiarygodnej wyceny zamiast ceny jest powód „za mało ofert”. Bez sieci, bez kosztów i zysku. Przycisk „Wystaw” w interfejsie dojdzie osobnym wpisem.

## 2026-11-21 (162) — Okazje: przyciski „Obejrzane / Odłóż / Nie dla mnie”, Łowca: sesja w sklepie

- **Okazje:** przy każdej okazji są trzy przyciski. Po kliknięciu pozycja znika z listy, a toast „Cofnij” przywraca ją. Domyślnie ukryte są odłożone, obejrzane i odrzucone (przełącznik „Pokaż ukryte”); okazja, która wróciła po obniżce ceny albo po końcu odłożenia, ma znaczek „wróciła: …”. Nagłówek podaje liczby („5 nowe, 2 odłożone”). Ranking bez zmian. W „Dziś”, pod „Planem dnia”, widać medianę czasu reakcji „ogłoszona → obejrzana”, gdy już jest z czego ją policzyć.
- **Łowca — sesja w sklepie:** każde sprawdzenie ISBN trafia na listę sesji (tytuł albo ISBN, cena z półki, werdykt, „Biorę”, „Usuń”); ten sam ISBN sprawdzony drugi raz aktualizuje wiersz. Na dole pasek sum: ile książek, ile „Biorę”, suma cen z półki i suma wycen zaznaczonych (z dopiskiem, ile bez wyceny); bez kosztów i zysku. Sesja zapisuje się w przeglądarce (do 200 pozycji), „Nowa sesja” czyści ją po potwierdzeniu. Wygląd (zwłaszcza pasek sum nad dolną nawigacją na telefonie) nie był oglądany w przeglądarce.

## 2026-11-21 (160) — Frazy skanu: statystyki i wyłączanie szumu (odczyt i harmonogram)

- Nowy odczyt `GET /api/phrases`: dla każdej frazy skanu nowe oferty z ostatnich 14 dni, ile z nich to dziś okazje, udział ofert bez ISBN, ostatnie widzenie i werdykt: „szum” (co najmniej 9 nowych ofert i żadnej okazji), „ok” albo „za mało danych” (oferty z mniej niż 3 różnych dni). Szumiące frazy są na początku listy.
- `PUT /api/phrases/disabled` `{phrase, disabled}` odwracalnie wyłącza frazę: **skany z harmonogramu** (pełny, szybki i snajper) jej nie uruchamiają (snajper uzupełnia partię następnymi celami), a skan wpisany ręcznie zawsze robi to, co wpisano. Gdy wszystkie frazy profilu są wyłączone, przebieg jest pomijany („all-phrases-disabled”). Widok „Frazy” w interfejsie dojdzie osobnym wpisem.

## 2026-11-21 (159) — „Łowca” (widok) i znaczek obniżki w Okazjach

- Nowa zakładka **Łowca** (też w dolnej nawigacji telefonu): wpisz ISBN książki ze sklepu lub kiermaszu i cenę z półki, a zobaczysz duży werdykt (warto / raczej tak / na granicy / drogo — kolorem, tekstem i znakiem), wycenę z zakresem i wiarygodnością, szansę sprzedaży w 30 dni, ile ofert jest teraz i najtańszą. Przy niepewnej wycenie jest ostrzeżenie; nieznany ISBN i błędny numer mają osobne komunikaty. Pola mają co najmniej 44 px wysokości, układ jednokolumnowy na telefonie. Enter wysyła; dane z katalogu, bez kosztów.
- W „Okazjach” oferta z obniżką ceny ma znaczek „obniżka −NN%”; poprzednia cena jest w podpowiedzi i etykiecie dla czytnika ekranu.

## 2026-11-21 (158) — Skrzynka okazji (stan pracy) i Łowca (odczyt)

- **Skrzynka okazji** (migracja 140): przy okazji można ustawić stan „Obejrzane”, „Odłóż” (do wybranego czasu, domyślnie doba) albo „Nie dla mnie” — `PUT /api/deals/:offerId/triage`, `DELETE` cofa. Stan zmienia tylko widoczność (`hidden`), ranking okazji zostaje bez zmian. Obejrzana lub odrzucona okazja wraca, gdy cena spadnie poniżej ceny z chwili ustawienia stanu („obniżka po odrzuceniu”); odłożona wraca dokładnie o ustawionej godzinie. Stan znika razem z ofertą. Karta „Okazje do obejrzenia” w planie dnia pomija ukryte. `/api/deals` zwraca `triage.counts` (nowe / odłożone / obejrzane / odrzucone) i `triage.reactionMedianMinutes` — medianę czasu od ogłoszenia okazji do pierwszego spojrzenia. Interfejs przycisków dojdzie osobnym wpisem.
- **Łowca**: `GET /api/hunter?isbn=…&price=15,00` sprawdza ISBN (dowolny zapis) w katalogu i zwraca wydanie, wycenę z zakresem i pewnością, szansę sprzedaży w 30 dni, ile ofert jest teraz i najtańszą, oraz werdykt ceny z półki wobec wyceny (warto / raczej tak / na granicy / drogo). Bez sieci, bez kosztów i zysku. Widok Łowcy opisuje wpis 159.

## 2026-11-21 (157) — Dziś: „Plan dnia” i sygnał obniżki ceny

- Na górze „Dziś” pojawił się **Plan dnia**: kilka kart w kolejności pracy, z trzema wpisami i przyciskiem „Otwórz”: (1) okazje do obejrzenia (wiarygodna wycena, bez ocenionych i podejrzanie tanich), (2) decyzje, które odblokowują najwięcej kolejki (otwiera Weryfikację posortowaną „Odblokowują najwięcej ofert”), (3) szybko schodzące książki, których nikt teraz nie wystawia na Vinted. Karty bez niczego do zrobienia znikają; gdy nic nie czeka, jest jedna linia „Na dziś nic nie czeka.” Dane: nowe pole `plan` w `/api/today` (`day-plan.mjs`), tylko odczyt, bez kosztów i zysku. Wygląd nie był oglądany w przeglądarce.
- Okazje mają nowe pole `priceDrop` (`/api/deals`): jeśli sprzedający obniżył cenę, widać poprzednią cenę i procent obniżki (z historii cen oferty). Na razie bez znaczka w interfejsie.
- Runner testów (`npm test`) ponawia pliki, które padły wyłącznie z błędem sieci maszyny (zapchane porty lokalne: `EADDRINUSE`, `ETIMEDOUT`…); prawdziwy błąd obok sieciowego blokuje ponowienie.

## 2026-11-21 (156) — Kopia bazy przed automatycznym scaleniem duplikatów

- Scalanie duplikatów dzieł przy starcie jest nieodwracalne, a dotąd chroniła je tylko codzienna kopia (mogła być sprzed kilku godzin). Teraz tuż przed takim scaleniem powstaje kopia `…-safety-merge-….sqlite` w folderze `backups` (kontrola integralności, 3 najnowsze, codzienna rotacja ich nie rusza). Gdy kopii nie da się zrobić, scalania nie ma, a aplikacja zapamiętuje, że jest „do zrobienia” i ponawia je przy następnym starcie; niedokończony plik kopii jest usuwany. `BOOKFLIP_AUTO_BACKUP=0` wyłącza kopię i scalanie działa jak dotąd. Kopia ma rozmiar bazy.

## 2026-11-21 (155) — Narzędzie: pomiar ofert bez ISBN (na kopii bazy)

- Nowy skrypt `node scripts/measure-isbnless.mjs <kopia.sqlite>` (tylko odczyt; odmawia pracy na folderze danych właściciela, więc najpierw `node scripts/backup-catalog.mjs <kopia.sqlite>`) podaje, ile ofert w każdym źródle nie ma ISBN i ile z nich ma jednoznacznego kandydata po tytule (dokładnie jedno dzieło), oraz jak często taka podpowiedź zgadza się z wydaniem potwierdzonym przez Ciebie ręcznie. Werdykt: poniżej 30 potwierdzonych ofert „za mała próba”, od 99% trafności „tylko podpowiedź w polu ISBN”, inaczej „zostaje ISBN-only”. Nic nie zmienia w aplikacji ani w przypisaniach. Uwaga: próba to oferty, które potwierdziłeś ręcznie, a więc takie, których automat nie rozstrzygnął, więc trafność może być zawyżona lub zaniżona; wynik to wskazówka, nie dowód. Nie był uruchamiany na Twoich danych.

## 2026-11-21 (154) — Weryfikacja: sortowanie „Odblokowują najwięcej ofert”

- W „Do weryfikacji” doszło sortowanie „Odblokowują najwięcej ofert”: decyzje z największą liczbą ofert pod spodem (oferty z tym samym ISBN to jedna decyzja) idą pierwsze, potem tańsze, remis rozstrzyga stabilnie. Domyślne sortowanie bez zmian; zmiana na liście rozwijanej „Sortowanie”. Wygląd nie był oglądany w przeglądarce (to jedna opcja listy). Z karty „decyzje, które odblokowują najwięcej” z sesji kreatywnej.

## 2026-11-21 (153) — Vinted: polskie tytuły z obcym słowem, polubienia, pusty wynik

- **Błąd:** oferty Vinted z tytułem zaczynającym się od obcego słowa, np. „Germania” Tacyta, były odrzucane jako obcojęzyczne (wzorzec `german` bez granic słowa) i znikały po cichu. Teraz „german” nie dopasowuje już polskich „Germania”, „Germanowie”, „Germanie”; „Deutsch…”, „Italiano…”, „Français…”, „Español…” i „Germanic” nadal odpadają jak dotąd.
- **Błąd:** liczba polubień (`favourite_count`) była gubiona, gdy w obiekcie oferty przed nią stał zagnieżdżony obiekt (np. zdjęcie), więc kolumna i ranking popularności pomijały takie oferty.
- **Błąd:** pusta strona wyników Vinted (strona 1 z 0) dawała stan „nieznany”, więc skan fazy uznawał zakres za niepełny i nie rozstrzygał, czy oferty zniknęły. Teraz to koniec wyników.

## 2026-11-21 (152) — Metadane: timeout ciała odpowiedzi i zepsuta encja w e-ISBN

- **Błąd:** gdy serwer metadanych odpowiedział nagłówkami 200, a ciało zawiesił, timeout był liczony jako „zepsuty JSON” i oferta trafiała do ręcznej kolejki (`metadata_invalid_or_incomplete`) zamiast do ponowienia. Teraz to błąd tymczasowy: próba jest ponawiana, a po wyczerpaniu zapisuje się `temporary_error`.
- **Błąd:** rekord e-ISBN z niepoprawną encją liczbową (np. `&#1114112;`) przerywał identyfikację całego ISBN wyjątkiem. Teraz zepsuta encja zostaje w tekście, a reszta rekordu jest czytana.

## 2026-11-21 (151) — Snajper i szybki skan: błąd źródła to „częściowo”; „Dziś” opisuje pełny skan

- **Błąd:** gdy snajper albo szybki skan dostał odpowiedź 200, ale źródło zawiodło w środku skanu (np. blokada Vinted), przebieg był zapisywany jako „ok”, a snajper przesuwał kursor fraz, więc nigdy nie sprawdzone frazy czekały do następnego kółka. Teraz taki przebieg jest „częściowy” i kursor zostaje na miejscu (jak przy pełnym skanie).
- **Błąd:** w „Dziś” „ostatni skan” był prawie zawsze krótkim przebiegiem snajpera (osobny wiersz co 15-60 min), więc liczby nowych ofert, zmian cen, czasu i błędów opisywały 10 fraz zamiast pełnego skanu. Teraz „Dziś” opisuje ostatni pełny skan, a przebieg szybki tylko wtedy, gdy innego nie ma.
- Plan odblokowania kolejki używa tej samej normalizacji ISBN co licznik kolejki.

## 2026-11-21 (150) — Dziś: ile ofert obejmuje 20 największych decyzji

- `/api/today` zwraca w `queue.unlock` plan kolejki liczonej w ofertach na decyzję: ile ofert wchodzi do 20 największych decyzji (oferty z tym samym ISBN to jedna decyzja, jak w liczniku kolejki), z sumą cen ofert (ceny od 10 000 zł i nieznane pomijane). Gry i obce wydania (odrzucenie niczego nie odblokowuje) oraz oferty pominięte klawiszem S nie są proponowane; Empik liczony jak dotąd poza kolejką. W „Dziś”, pod liczbą decyzji w kolejce, doszło zdanie „20 największych decyzji obejmuje 340 z 851 ofert” (tylko gdy kolejka jest dłuższa i coś z tego wynika; wygląd nie był oglądany w przeglądarce). Dotychczasowe `queue.decisions` i `queue.offers` bez zmian. Pierwszy krok karty „decyzje, które odblokowują najwięcej” z sesji kreatywnej; czy top-20 faktycznie odblokowuje sporo ofert, wyjdzie dopiero na Twoich danych.

## 2026-11-21 (149) — Skan: liczniki nowych ofert i zmian ceny

- **Błąd:** ta sama nowa oferta znaleziona przez dwie frazy w trakcie skanu była liczona jako „nowa” dwa razy w pasku postępu i diagnostyce (końcowe podsumowanie było poprawne, więc liczby w trakcie i po skanie się rozjeżdżały). Teraz jest nowa raz.
- **Błąd:** oferta, która miała w bazie nieznaną cenę (np. wyczyszczoną jako nierealną), po skanie z poprawną ceną była liczona jako „cena zmieniona”. Teraz uzupełnienie nieznanej ceny nie jest zmianą ceny.

## 2026-11-21 (148) — Dziś: ostrzeżenie o źródle, które po cichu przestało dawać nowe oferty

- W „Dziś” pojawia się jedna linia ostrzeżenia, gdy źródło przyniosło w ostatnich 7 dniach mniej niż połowę nowych ofert z tygodnia wcześniej (przy co najmniej 20 w poprzednim): zmiana układu strony zwykle nie wywołuje błędu, tylko po cichu zmniejsza wyniki. Linia zapala się też, gdy skan był wyłączony przez tydzień. Źródła bez legalnego dostępu są pomijane; przy braku problemu nic nie widać. Z pierwszej karty planu dnia z sesji kreatywnej; wygląd nie był oglądany w przeglądarce (używa istniejących klas).

## 2026-11-21 (147) — Interfejs: czytelny błąd HTTP i ocena okazji nie cofa się po odświeżeniu

- **Błąd:** odpowiedź serwera lub pośrednika bez poprawnego JSON-a (pusta, strona błędu) dawała w komunikatach techniczne „Unexpected end of JSON input” zamiast kodu HTTP (np. `HTTP_502`). Teraz widać kod.
- **Błąd:** ocena okazji zapisana w trakcie odświeżania listy mogła „cofnąć się” (wiersz wracał do stanu nieocenionego), gdy starsza odpowiedź `/api/deals` dotarła po zapisie. Teraz starsza odpowiedź jest pomijana.

## 2026-11-21 (146) — Skan nie blokuje się przez żądanie bez ciała

- **Błąd:** żądanie rozpoczęcia skanu, które zapowiadało ciało i go nie wysyłało (zerwane lub zawieszone połączenie), zajmowało miejsce skanu aż do zamknięcia połączenia i kolejne skany dostawały „skan już trwa”. Teraz ciało jest czytane przed zajęciem skanu.

## 2026-11-21 (145) — Zatwierdzanie hurtowe: większa partia nie kończy się błędem

- **Błąd:** zatwierdzenie w „Szybkich” (i w planie pewnych decyzji) kilkuset pozycji naraz kończyło się błędem 413 „żądanie za duże”, bo limit ciała żądania wynosił 32 KB, a pozycja zajmuje ok. 120 bajtów (granica wypadała przy ok. 270-330 pozycjach). Teraz trasy planów i zatwierdzania partii przyjmują do 512 KB; pozostałe trasy mają dotychczasowy limit. Serwer nadal przetwarza najwyżej 500 pozycji naraz.

## 2026-11-21 (144) — Ciało żądania, które nie jest obiektem, to błąd 400

- **Błąd:** żądanie zapisu z ciałem JSON `null`, tablicą, liczbą lub tekstem kończyło się błędem 500 (`LOCAL_APP_ERROR`), jakby zawiódł serwer. Teraz dostaje 400 `JSON_OBJECT_REQUIRED`; puste ciało nadal jest traktowane jak `{}`. Aplikacja wysyła wyłącznie obiekty, więc jej działanie się nie zmienia.
- Cofnięcie oznaczenia „zestaw” przywraca przy ręcznym przypisaniu także jego zakończone zadanie (wcześniej wracało w kolejce). Cena zapisana jako `1,234.56` jest czytana jako 1234,56 zł.

## 2026-11-21 (143) — Usuwanie dzieła i miary: oferty bez zadania, cofnięte decyzje

- **Błąd:** usunięcie dzieła odpinało oferty, które miały aktywne przypisanie, ale nie miały zadania identyfikacji, bez żadnego zapisu decyzji, więc „Usunięte z katalogu” nie mogło ich przywrócić. Teraz takie oferty dostają zakończone zadanie i decyzję, a przywrócenie dzieła oddaje im przypisanie.
- **Błąd:** miara „rozpoznawanie” wykluczała z mianownika oferty oznaczone kiedyś „nie książka” albo wykluczone nawet po cofnięciu decyzji lub ponownym zakolejkowaniu, więc liczba nie zgadzała się z listami. Teraz liczą się tylko decyzje, które nie zostały cofnięte ani zakolejkowane na nowo.

## 2026-11-21 (142) — Oferta z nieczytelną ceną nie jest uznawana za zniknięcie

- **Błąd:** gdy sklep zmienił cenę oferty na zapis, którego nie da się odczytać (np. „0,00 zł” albo nieprawidłowy format), oferta była po cichu pomijana, a następny pełny skan oznaczał ją jako „nie widziana”, choć nadal była wystawiona. Teraz takie pominięcie jest liczone (powód „z nieczytelną ceną” w podsumowaniu skanu), a skan z taką ofertą nie jest uznawany za kompletny i niczego nie oznacza jako zniknięte, tak samo jak przy nieznanym języku. Dotyczy czytnika sklepów; inne źródła mają własne ścieżki.

## 2026-11-21 (141) — Ceny: rok przed ceną nie psuje kwoty

- **Błąd:** w ogólnym czytniku kart sklepów (bez JSON-LD i bez `itemprop=price`) liczba stojąca tuż przed ceną, np. rok wydania, była sklejana z kwotą jako „grupa tysięcy”: „Wydanie 2019 159,00 zł” dawało 2 019 159 zł i oferta po cichu znikała. Teraz grupa tysięcy wymaga początkowej grupy 1-3 cyfr, więc wychodzi 159,00 zł. Cena z kropką tysięcy i przecinkiem dziesiętnym (`1.234,56`) jest czytana poprawnie zamiast dawać NaN. Znana niejednoznaczność zostaje: „Tom 2 150,00 zł” czyta się jako 2150 zł.

## 2026-11-21 (140) — Zestawy: cofnięcie zestawu oddaje wcześniejszą decyzję

- **Błąd:** oznaczenie oferty jako zestaw, a potem cofnięcie tego oznaczenia, zapominało wcześniejszą decyzję: oferta oznaczona „nie książka” albo wykluczona wracała do identyfikacji, a ręczne przypisanie przepadało. Teraz oznaczenie zapamiętuje poprzedni stan (także przy ponownym oznaczeniu), a cofnięcie przywraca wykluczenie i ręczne przypisanie (o ile oferta nie dostała w międzyczasie nowego aktywnego). Oferty bez zadania identyfikacji dostają je przy oznaczeniu jako miejsce na migawkę.

## 2026-11-21 (139) — Kolejka: pomoc skrótów („?”) i cofnięcie klawiszem „U”

- W widokach kolejki (Weryfikacja, Zestawy i pozostałe) klawisz „?” otwiera okno z listą skrótów, a „U” naciska widoczny przycisk „Cofnij” z ostatniego komunikatu (tylko dokładnie „Cofnij”, nie „Cofnij partię”). Skróty nie działają w polach tekstowych, przy otwartym oknie ani z Ctrl/Alt/Meta. Żaden nowy skrót nie zatwierdza ani nie odrzuca. Uwaga: istniejący Enter w Weryfikacji zatwierdza propozycję (bez zmian); jeśli wolisz potwierdzenie, to osobna decyzja.

## 2026-11-21 (138) — Rozliczenie prognoz okazji

- Nowy odczyt `GET /api/deal-forecasts` (bez zmian w bazie i bez interfejsu): dla okazji ogłoszonych co najmniej 30 dni temu pokazuje, jaki odsetek sprzedał się w 30 dni (wg stanu zapisanego przez skany), na tle ofert z tych samych tygodni, które nigdy nie były okazją, oraz średnią prognozowaną szansę i wynik Briera (z wynikiem „zawsze średnia” do porównania). Odpowiada na pytanie, czy ranking „oszczędność × szansa” coś przewiduje. Dziś zwykle puste: snajper działa od 20.11, więc pierwsze okazje rozliczą się po 30 dniach. Obie grupy liczone są od pierwszego zobaczenia oferty i tylko dla ofert z aktywnym przypisaniem; oferty, których wynik nie jest znany (niesprzedane i niesprawdzone po 30 dniach), są liczone osobno jako „nierozstrzygnięte”. Liczby czytaj jako różnicę, nie wartości bezwzględne: okazja jest z definicji tańsza, a tańsze egzemplarze sprzedają się szybciej, więc wyższy odsetek sprzedaży może wynikać z samej ceny (w odpowiedzi znacznik `caveat`). Pomysł z sesji kreatywnej.

## 2026-11-21 (137) — Zdrowie danych: wykrywanie cichego spadku ofert

- Nowy odczyt `GET /api/data-health` (bez zmian w bazie i bez interfejsu): dla każdego źródła liczba nowych ofert z ostatnich 7 dni na tle poprzednich 7, udział ofert bez ISBN i bez ceny (także cen od 10 000 zł) oraz znacznik „podejrzany spadek” (uwaga: zapala się też, gdy aplikacja przez tydzień nie skanowała) (mniej niż połowa nowych ofert przy co najmniej 20 w poprzednim tygodniu). Zmiana układu strony zwykle nie wywołuje błędu, tylko po cichu zmniejsza wyniki; to ma ją pokazać. Pomysł z sesji kreatywnej (zdrowie danych).

## 2026-11-21 (136) — Metadane: dwa ISBN obok siebie nie giną

- **Błąd:** gdy źródło metadanych podawało w jednym polu ISBN-13 i ISBN-10 oddzielone spacją, parser sklejał je w jeden ciąg i odrzucał oba, więc rekord bywał uznany za niezgodny albo pomijany. Teraz oba numery są rozpoznawane osobno (numery niepoprawne nadal odpadają).

## 2026-11-21 (135) — Rynek: oferty, które zniknęły ze skanów, nie zaniżają szansy sprzedaży

- **Błąd:** oferta Vinted oznaczona jako „nie widziana” liczyła się jako żywa i jej czas na rynku rósł do dziś, więc zawyżała „podaż” i zaniżała 30-dniową szansę sprzedaży (a przez nią kolejność w Okazjach i celach snajpera). Teraz taka oferta nie jest żywa, a jej czas kończy się w dniu ostatniego widzenia.
- **Błąd:** nieczytelna data zamknięcia oferty mogła zamienić szansę sprzedaży w NaN; teraz jest pomijana.

## 2026-11-21 (134) — Scalanie grupy duplikatów szanuje „To różne książki”

- **Błąd:** scalenie grupy duplikatów (przycisk i automatyczne scalanie przy starcie) mogło połączyć dwie książki, które oznaczyłeś jako różne, gdy w grupie był trzeci egzemplarz z tym samym kluczem (grupa znikała z listy tylko wtedy, gdy każda para była oznaczona). Scalenie jest nieodwracalne, więc teraz taka grupa dostaje 409 `MARKED_DISTINCT` i nic się nie scala.

## 2026-11-21 (133) — Niezgodny tytuł nie cofa ręcznego przypisania

- **Błąd:** akcja „do weryfikacji” przy niezgodnym tytule ogłoszenia (`/api/catalog/title-conflicts/resolve`) mogła wycofać przypisanie ręczne oferty, choć lista takich przypadków pomija ręczne. Teraz takie żądanie dostaje 409 `MANUAL_ASSIGNMENT_PROTECTED`, a przypisanie zostaje aktywne.

## 2026-11-21 (132) — Zawieszony skan nie blokuje harmonogramu

- **Błąd:** gdy żądanie skanu z harmonogramu (pełny, szybki, snajper) nigdy nie dostało odpowiedzi, harmonogram uznawał się za zajęty do restartu aplikacji. Teraz żądanie bez odpowiedzi przez 3 godziny jest porzucane (błąd `SCAN_TIMEOUT` w ostatnim wyniku), a stan harmonogramu jest zwalniany. Skan po stronie serwera nie jest przy tym przerywany, więc kolejne uruchomienia mogą dostać „skan trwa”, dopóki ten się nie zakończy.

## 2026-11-21 (131) — Nieudany skan snajpera nie pomija fraz

- **Błąd:** snajper przesuwał kursor fraz także po nieudanym skanie (np. HTTP 503 z Vinted), więc najlepsze frazy były pomijane do końca kółka. Teraz kursor przesuwa się tylko po udanym skanie.

## 2026-11-21 (130) — Dostępność: listy Okazji i Rynku nie są odczytywane w całości

- Listy „Okazje” i „Rynek” przestały być regionem `aria-live`, więc czytnik ekranu nie odczytuje całej zawartości po każdym odświeżeniu; zmiany zapowiadają krótkie podsumowania nad listami (`role=status`).

## 2026-11-21 (129) — Dostępność: cele dotykowe i fokus palety

- Na telefonie (do 900 px) chipy oceny okazji i linki w nagłówkach źródeł skanera mają cel dotykowy 44 px (wcześniej ok. 22 i 28 px). Desktop bez zmian.
- Pole wyszukiwania palety poleceń ma widoczny wskaźnik fokusu z klawiatury (podkreślenie w kolorze marki).

## 2026-11-21 (128) — Scalanie książek zachowuje etykiety; zabezpieczenia danych

- **Błąd:** scalenie dwóch książek zostawiało etykiety książki źródłowej przypięte do ukrytego aliasu, więc znikały z list i filtrów. Teraz etykiety, których cel nie ma, przechodzą na książkę docelową (bez duplikatów); ręczne przypisania i zestawy nie są ruszane. Etykiety zostawione na ukrytych aliasach przez wcześniejsze scalenia przeniesie jednorazowo pierwszy start po aktualizacji (na książkę na końcu łańcucha scaleń).
- Zabezpieczenie: jednorazowe naprawy przy starcie wykonywane przez `runOnce` i zapis ich flagi są jedną transakcją, więc przerwanie w trakcie nie powtarza ani nie zostawia połowy takiego zadania. Pozostałe kroki startu (m.in. aktualizacja bibliografii z automatycznym scalaniem duplikatów) mają własne flagi, jak dotąd.
- Zabezpieczenie: identyfikatory automatycznych decyzji „jak odrzucona oferta” i ich cofnięcia są unikalne także przy identycznym znaczniku czasu (prefiks `auto_reject_` bez zmian).

## 2026-11-21 (127) — Zabezpieczenie: zdjęcia i okładki

- **Błąd:** obca strona otwarta w przeglądarce mogła przez `<img src>` wywołać trasy zdjęć (`/api/image`, `/api/cover`, `/api/offers/:id/image`), które pobierają dane z sieci i zapisują cache lub adres zdjęcia oferty. Teraz takie żądanie z nagłówkiem `Sec-Fetch-Site` innym niż `same-origin`/`none` dostaje 403 (`FORBIDDEN_CROSS_SITE`); własna aplikacja działa bez zmian. Brak tego nagłówka (starsze przeglądarki, curl) nadal przechodzi.
- **Błąd:** chwilowa awaria CDN (429, 5xx, błąd sieci) chowała zdjęcie na 24 h. Teraz „brak zdjęcia” na dobę zapisuje się tylko dla 404/410 i odpowiedzi, która nie jest obrazem. Błędy przejściowe (401/403/429, 5xx, sieć) są ponawiane po krótkiej przerwie (ok. 2 min), a nie przy każdym żądaniu; miniatura, która zawiodła takim błędem, nie powoduje dodatkowego pobrania oryginału, a do CDN idzie najwyżej 6 pobrań naraz.
- Zdjęcie większe niż limit 4 MB przerywa pobieranie w trakcie czytania, zamiast wczytywać całość do pamięci.
- Błędy `/api/image` i `/api/buyback/check` nie zwracają już surowego tekstu wyjątku, tylko kod lub kod ogólny.

## 2026-11-21 (126) — Oferta bez rozpoznanego języka nie znika z aktywnych

- **Błąd:** gdy przy skanie Vinted (tylko polskie wydania) nie udało się odczytać języka oferty zapisanej wcześniej, oferta była odrzucana z listy, a skan uznawał ją za zniknięty i oznaczał „nie widziana”, choć nadal była wystawiona. Teraz skan z takimi ofertami nie jest uznawany za kompletny i niczego nie oznacza jako zniknięte. Oferty rozpoznane jako obcojęzyczne nadal nie wpływają na kompletność skanu.

## 2026-11-21 (125) — Skan przerywa stronicowanie, gdy źródło powtarza tę samą stronę

- **Błąd:** gdy źródło ignorowało numer strony i dalej zapowiadało następną, skan czytał do 50 identycznych stron jednej frazy. Teraz druga identyczna strona (ten sam skrót lub te same adresy ofert) przerywa stronicowanie tej frazy: oferty nie są dublowane, fraza jest raportowana jako niepełna („powtarzające się strony”), źródło nie jest oznaczane jako zablokowane, a oferty nie są uznawane za zniknięte. Limit 50 stron bez zmian. Strony, na których filtry odrzuciły wszystkie oferty, nie są uznawane za powtórzone, więc skan czyta dalej.

## 2026-11-21 (124) — Koszt dostawy: zapytanie bez powtórzonego parametru

- **Błąd:** w zapytaniu pomocniczym uzupełniania kosztu dostawy Vinted (`shipping-backfill.mjs`) powtórzony numerowany parametr `?1` powodował w CI na Node 22.16.0 błąd „column index out of range”. Teraz zapytanie używa zwykłych parametrów. Wynik na Node 26 bez zmian (testy przechodzą); na Node 22.16.0 poprawka nie została tu sprawdzona.

## 2026-11-21 (123) — Konflikt z ręcznym przypisaniem nie psuje zadania identyfikacji

- **Błąd:** gdy ręczne przypisanie oferty pojawiło się tuż przed zapisem automatycznego, zadanie kończyło się błędem (`failed`). Teraz trafia do kolejki przeglądu z powodem `manual_assignment_conflicts_with_candidate`; ręczne przypisanie zostaje bez zmian, nie powstaje wpis „Automat (ISBN)” i zadanie nie jest ponawiane.

## 2026-11-21 (122) — Zabezpieczenie: automat nie nadpisze ręcznego przypisania

- Zmiana wewnętrzna, nic nie zmienia się w widoku. Zapis przypisania oferty do wydania odrzuca teraz (błąd `MANUAL_ASSIGNMENT_CONFLICT`) aktywne przypisanie automatyczne, gdy oferta ma aktywne przypisanie ręczne. Dotychczasowe zabezpieczenia w wyszukiwaniu i kolejce przeglądu działają jak wcześniej; to dodatkowa ochrona na wypadek nowej ścieżki automatycznej.

## 2026-11-21 (121) — Ceny od 10 000 zł nie liczą się jako zmiana ceny

- **Błąd:** oferta z ceną 10 000 zł lub więcej jest zapisywana bez ceny (cena nieznana), a skan porównywał ją z surową ceną ze strony. Każdy kolejny skan liczył więc taką ofertę jako zmianę ceny i oznaczał ją jako „zmieniona” w wynikach skanu. Teraz porównanie używa ceny w takiej postaci, w jakiej jest zapisywana: oferta z ceną 15 000 zł skanowana dwa razy nie daje zmiany, a oferta, która miała 50 zł i pokazała cenę nierealną, zachowuje 50 zł i też nie jest zmianą. Zmiana 50 zł na 60 zł liczy się jak dotąd.

## 2026-11-21 (120) — Powtarzające się 403 blokuje źródło w skanie

- **Błąd:** źródło odpowiadające 403 (inne niż CAPTCHA) było pytane dla każdej kolejnej frazy i strony, bo uznawano to za chwilową odmowę. Teraz po drugim 403 z rzędu w jednym skanie źródło jest oznaczone jako zablokowane (jak przy CAPTCHA): pozostałe frazy są pomijane bez zapytań i źródło widać jako zablokowane. Pojedyncze 403 nadal jest ponawiane, nie częściej niż dotąd. W teście z 3 frazami źródło dostaje 2 zapytania zamiast 9. 429 i CAPTCHA działają jak wcześniej. Dotyczy odczytu list wyników; strony szczegółów ogłoszeń Vinted nadal są ponawiane jak dotąd.

## 2026-11-21 (119) — Automatyczne przypisania ISBN w „Ostatnich decyzjach”

- Gdy automat sam przypisze ofertę do wydania na podstawie ISBN i zgodnego kontekstu oferty, w „Ostatnich decyzjach” pojawia się wiersz z etykietą **„Automat (ISBN)”**. Można go cofnąć przyciskiem „Popraw decyzję”; wydanie jest wtedy odrzucone dla tej oferty i ponowienie go nie powtórzy.
- Dotyczy tylko nowych przypisań, nie wsteczne. Ręcznych przypisań i zestawów to nie obejmuje. Cofnięcie nie usuwa założonego przez automat dzieła ani wydania. Jeśli program zostanie przerwany dokładnie między przypisaniem a zapisem wiersza, ta jedna oferta zostanie przypisana bez wiersza w „Ostatnich decyzjach” (odłączysz ją wtedy ze szczegółów oferty).
- Na liście jest najwyżej 10 takich wierszy, więc Twoje własne decyzje nie znikają z widoku. „Ręcznie: zatwierdzone” w statystykach nie liczy decyzji automatu.

## 2026-11-21 (118) — Cofnięta decyzja automatyczna nie wraca

- **Błąd:** po cofnięciu automatycznej decyzji w „Ostatnich decyzjach” późniejsze ponowienie identyfikacji mogło przypisać ofercie to samo wydanie. Teraz cofnięcie zapisuje to wydanie jako odrzucone dla tej oferty i oferta zostaje w „Do weryfikacji”. Dotyczy decyzji zapisanych przez automat i tylko gdy oferta miała jeszcze aktywne przypisanie. Cofnięcie Twojej własnej decyzji lub paczki, ręczne przypisania i zestawy nie są zmieniane.

## 2026-11-21 (117) — Filtr „Bez etykiety”

- W „Filtrach katalogu” → „Etykieta” jest opcja **„Bez etykiety”**: lista pokazuje tylko książki, którym jeszcze nie nadałeś etykiety. Książki z etykietą są ukryte.
- Gdy ten filtr jest włączony i nadasz książce etykietę z listy, wiersz od razu znika z listy. Można tak przejść po kolei cały katalog.

## 2026-11-21 (116) — Etykiety z listy książek

- **Etykieta bez wchodzenia w książkę:** w widoku „Lista” i „Okładki” pod „×” jest przycisk z ikoną metki. Otwiera listę rozwijaną Twoich etykiet: wybierasz i etykieta od razu jest zapisana. „+ Nowa etykieta…” pozwala wpisać nową. W tym samym okienku × przy etykiecie ją zdejmuje. Esc albo kliknięcie obok zamyka okienko.
- **Badge z nazwą:** etykieta jest teraz zielonym znaczkiem z kropką pod danymi książki, także pod okładką w widoku „Okładki”. Świeżo dodana na chwilę się podświetla.
- **Filtr „Etykieta”** w „Filtrach katalogu” to teraz lista rozwijana z liczbą książek przy każdej etykiecie („Gaunt (2)”), zamiast pola do wpisywania.

## 2026-11-20 (115) — Etykiety na książkach i własne serie

- **Etykiety:** na stronie książki, pod tytułem, dodajesz dowolne znaczniki („Gaunt”, „do sprawdzenia”, „komplet”). Wpisz i naciśnij Enter albo wybierz z podpowiedzi; × usuwa. Wielkość liter nie ma znaczenia: „gaunt” to ta sama etykieta co „Gaunt”. Etykiety widać przy książkach na liście.
- **Filtr etykiety:** Książki → „Filtry katalogu” → „Etykieta”. Gdy jest wybrana, pojawia się przycisk **„Utwórz serię z tych książek”**: powstaje seria o nazwie etykiety ze wszystkimi tymi książkami. Jeśli taka seria już jest, książki do niej dochodzą.
- **Własne serie:** w widoku „Serie” przycisk **„Nowa seria”** (nazwa i opcjonalnie grupa, np. „Warhammer”; bez grupy seria jest osobną grupą). Pusta seria też jest widoczna. Przy każdej nazwanej serii jest **„Dodaj książki”** (wyszukiwarka po tytule, autorze albo ISBN). Przy Twoich seriach jest też „Zmień nazwę lub grupę” i „Usuń serię”; książki zostają wtedy w katalogu. × pod okładką wyjmuje książkę z serii.
- Książka, która jest już w innej serii, nie jest przenoszona po cichu: przy dodawaniu widać „teraz w serii …” i przycisk „Przenieś tutaj”, a przy serii z etykiety komunikat podaje, ile książek zostało w swoich seriach.
- Numer tomu jest teraz opcjonalny, także w „Seria i tom”. Książka może być w serii, zanim znasz jej numer.
- **Błąd:** widok „Serie” przerysowywał się przy każdej zmianie w kolejce rozpoznawania i zamykał otwarte pole, np. edytor „Lista tomów” w trakcie pisania. Teraz odświeżenie w tle czeka, aż skończysz.

## 2026-11-20 (114) — Rynek i Snajper: która książka się sprzeda i okazja w kilka minut

- **Rynek** (Okazje → „Rynek”): każde wydanie z wyceną ma trzy liczby: ile jest wart używany egzemplarz, jaka jest szansa sprzedaży wystawionego egzemplarza w 30 dni i ile to zwykle trwa. Do tego **obrót** (wartość × szansa), sprzedane i dostępne egzemplarze na Vinted. Sortowanie: obrót, najszybciej schodzi, najwyższa wartość, najwięcej w sprzedaży; wyszukiwarka po tytule i autorze.
- Skąd szansa: z czasu wystawienia i sprzedaży wszystkich ofert danego wydania na Vinted. Wydanie z małą liczbą ofert dostaje średnią wydań o podobnym popycie (polubieniach). Na kopii bazy: 2 364 oferty, 151 sprzedanych, a przeciętny egzemplarz ma **18% szans na sprzedaż w 30 dni**. Wydań szybkich jest 105, przeciętnych 609, wolnych 184.
- **Okazje** układają się według **oczekiwanego zysku**: oszczędność × szansa sprzedaży w 30 dni, nadal bez kosztów wysyłki i prowizji. Duża różnica na książce, której nikt nie kupuje, spada pod mniejszą na takiej, która schodzi. Przy każdej okazji widać „schodzi szybko · 32% szans na sprzedaż w 30 dni · zwykle ~54 dni”.
- **Snajper** (na górze Okazji, domyślnie **wyłączony**): po włączeniu co 15, 20, 30 albo 60 min sprawdza najnowsze ogłoszenia Vinted dla 40 książek z najlepszym obrotem, po 10 na przebieg, przez ten sam skan i te same limity co zwykle. Nowa okazja (oferta sprzed najwyżej 2 dni, wiarygodna wycena) jest ogłaszana raz: lista „Nowa” w Okazjach, kropka przy ikonie w nawigacji, komunikat w aplikacji, a gdy karta jest w tle i pozwolisz — powiadomienie systemowe. Na kopii bazy byłoby od razu 21 takich okazji.
- Ograniczenia: dane Vinted są dopiero od 1.11, więc szanse dla pojedynczych wydań to szacunek, który z każdym tygodniem będzie dokładniejszy. Powiadomienia działają tylko przy otwartej aplikacji (na komputerze albo w telefonie przez Tailscale); bez otwartej karty nic nie przyjdzie. Każdy przebieg snajpera to zwykły skan, więc pojawia się jako „Ostatni skan” na ekranie Dziś.

## 2026-11-20 (113) — Okazje: czytelna ikona, na telefonie od razu lista

- Ikona Okazji w nawigacji to znak procentu zamiast zakręconej strzałki, która nic nie mówiła.
- Na telefonie opis zasad listy („co najmniej 20% i 5 zł poniżej…”) jest ukryty, więc pierwsza okazja jest wyżej. Na komputerze opis zostaje.
- Sprawdzone i odrzucone: pełny pasek boczny z nazwami od 1280 px. Kolejka jest wtedy za ciasna (karta kandydata łamie się po literze, zakładki grup są ucięte), więc do 1440 px pasek zostaje rzędem ikon z podpowiedziami.

## 2026-11-20 (112) — Spokojniejsza typografia

- Tytuły z katalogu (wydania na stronie książki, kolumna „Przypisanie” w Ofertach) są pisane tym samym krojem książkowym co lista książek. Tytuły ogłoszeń zostają w zwykłym kroju, więc od razu widać, co pochodzi z katalogu, a co od sprzedającego.
- Bez wersalików: nagłówki grup w Kolejce („Brandon Sanderson”), nagłówki tabel, podpisy sekcji, grupy palety poleceń i podpis w pasku bocznym („Skanowanie, katalog, weryfikacja”).
- Przycisk skanu to „Skanuj”, bez strzałki.
- Zaokrąglenia rogów mają trzy stopnie (małe przyciski, pola i kafle, panele) zamiast siedmiu różnych wartości; różnice to 1–2 px.

## 2026-11-20 (111) — Strona książki: wycena na górze

- Szacowana wartość („~44 zł, przedział 31–55 zł”) jest teraz pierwsza pod przyciskami i największa na stronie. Kafle z cenami są pod nią i mniejsze.
- Kafel „Mediana ofert” pojawia się dopiero przy dwóch ofertach (przy jednej powtarzał najniższą cenę). Kafel „Oferty” zniknął: liczbę ofert podaje lista tuż niżej.
- Nagłówki sekcji nie są już pisane wersalikami w jednym ciągu z podpowiedzią („SZACOWANA WARTOŚĆ RYNKOWA UŻYWANY EGZEMPLARZ…”). Teraz: „Szacowana wartość rynkowa” i jaśniej „używany egzemplarz w dobrym stanie”. Dotyczy to nagłówków sekcji w całej aplikacji na komputerze.

## 2026-11-20 (110) — Dziś: na górze to, co czeka na Ciebie

- Ekran zaczyna się od jednej dużej liczby: ile decyzji czeka w kolejce i od ilu dni najstarsza („694 decyzje czekają · najstarsza czeka 9 dni”), z przyciskiem „Weryfikuj”. Zastępuje kafel „Do decyzji” i przycisk „Weryfikacja” w nagłówku.
- Pozostałe kafle (nowe oferty, zmiany cen, źródła, skany) są mniejsze. Cztery miary są w jednym panelu zamiast czterech osobnych kart.
- Źródła bez legalnego dostępu (Allegro, Dedalus, OLX) są zwinięte w „3 bez legalnego dostępu”, obok „16 działa”. Na wierzchu zostają tylko źródła, które przestały działać.
- Na telefonie „Nowy skan” jest zwykłym przyciskiem, a nie paskiem na całą szerokość nad kolejką.

## 2026-11-20 (109) — Okazje: najpierw oszczędność, oceny ciszej

- W każdej okazji największą liczbą jest teraz oszczędność („−184 zł”). Pod nią rabat i cena („−65% · za 100,00 zł”), dalej wycena i wiarygodność.
- Cztery przyciski oceny („Trafna”, „Złe przypisanie”…) są małe i ciche; wyraźne robią się po najechaniu albo zaznaczeniu klawiaturą. Działają jak dotąd.
- Odnośnik do książki nie powtarza tytułu, który już widać w ogłoszeniu („Mort - Terry Pratchett” → „↳ strona książki”). Gdy ogłoszenie nazywa książkę inaczej, odnośnik pokazuje jej tytuł z katalogu.

## 2026-11-20 (108) — Aplikacja otwiera się od razu, a nie po 26 s

- **Błąd:** po uruchomieniu wszystkie zakładki pokazywały przez ok. 26 s „Wczytywanie…”. Panel „Stan katalogu, jakość źródeł i postęp serii” (na dole ekranu Dziś) liczył się na Twoich danych 28 s. Serwer liczy jedno naraz, więc Dziś, Kolejka i Okazje czekały na niego, choć same liczą się w 0,2 s.
- Teraz panel liczy się w 0,7 s (kopia bazy: 8,5 tys. ofert, ok. 1 tys. w kolejce) i tylko wtedy, gdy jest rozwinięty. Zwinięty nie zajmuje serwera wcale.

## 2026-11-20 (107) — Katalog: filtr po autorze

- Książki → „Filtry katalogu” → nowe pole **Autor**. Podpowiada wszystkich autorów z katalogu z liczbą książek, najwięcej książek najpierw. Po wybraniu autora lista pokazuje tylko jego książki.
- Różne zapisy tej samej osoby są jednym autorem: „Rowling, J. K.”, „J. K. Rowling” i „Rowling, J.K” dają razem 45 książek (na kopii bazy). Daty życia z BN („Pratchett, Terry (1948-2015)”) nie przeszkadzają.
- Autorzy pochodzą z dzieła i z danych BN jego wydań. Na kopii bazy jest 299 autorów: Terry Pratchett 99 książek, J. K. Rowling 45, Dan Abnett 39, Brandon Sanderson 38.
- Ograniczenie: inne imię tej samej osoby („Joanne K. Rowling”) albo samo nazwisko („Pratchett”) to osobna pozycja.

## 2026-11-20 (106) — Okazje: polubienia i popyt na wydanie

- Przy każdej okazji widać polubienia samej oferty (♥) i **popyt** na jej wydanie, czyli medianę polubień pozostałych ofert tego wydania na Vinted: wysoki (8+), średni (4–7), niski. Wysoki jest wyróżniony kolorem.
- Nowy porządek „Największy popyt” w polu „Sortuj”.
- Dlaczego: na kopii bazy oferta Vinted bez polubień sprzedała się w 0,6% przypadków, a z 10+ polubieniami w 7,6%. Gdy pozostałe oferty wydania miały medianę 0–1 polubień, oferta sprzedawała się w 3,4% przypadków, a przy 8+ w 8,6%.
- Na kopii bazy: 230 okazji, w domyślnym widoku 86. Z tych 86 popyt wysoki ma 9, średni 20, niski 42, a 15 nie ma danych (mniej niż 2 inne oferty Vinted z polubieniami).
- Popyt to podpowiedź, nie wycena: wartość i oszczędność liczą się jak dotąd.

## 2026-11-20 (105) — „Szukaj po serii”: tytuły-zwykłe słowa z autorem

- Listy Świat Dysku, Herezja Horusa i Gotrek i Felix wstawiają tytuły, które same są zwykłym słowem, razem z autorem albo uniwersum: „Eryk Pratchett”, „Mort Pratchett”, „Piramidy Pratchett”, „Maskarada Pratchett”, „Legion Abnett”, „Zdrajca Dembski-Bowden”, „Stara Ziemia Warhammer”, „Zabójca Gotrek” i inne (17 fraz). Tak jak w listach uniwersów (wpis 100).
- Dlaczego: na kopii bazy te frazy dały 1 822 oferty, czyli ok. 21% wszystkich. Rozpoznanych było 63, i prawie wszystkie to inne książki: kryminały z Empiku („Zabójca z sąsiedztwa”), „Upadłe anioły” Morgana, „Psi Patrol. Ruchome obrazki”. Prawdziwe tomy z serii to 3–4 oferty.
- Skan zostawia teraz tylko ogłoszenia z obydwoma słowami w tytule. Tytuły, które same dobrze trafiają („Kolor magii”: 11 ofert, 11 rozpoznanych), zostają bez autora, podobnie „Kosiarz” i „Muzyka duszy”.
- Zapisane wcześniej oferty zostają. Profile się nie zmieniają, bo żaden nie miał tych fraz.

## 2026-11-20 (104) — Anulowany automatyczny skan nie startuje od nowa

- **Błąd:** po anulowaniu skanu z harmonogramu ten sam profil startował ponownie po minucie, i tak po każdym anulowaniu. Harmonogram brał odpowiedź „skan anulowany” za „trwa inny skan” i nie zapisywał próby. U Ciebie profil „Pomiar: szeroki rynek” startował 19.11 o 23:58 oraz 20.11 o 19:21, 19:28 i 19:30, a ostatni zapisany przebieg harmonogramu był z 18.11.
- Teraz anulowanie liczy się jako przebieg („anulowany”, bez ostrzeżenia „ostatni nieudany”). Następny skan rusza w kolejnym terminie (co 12 h, następny profil po kolei).
- Automatyczny skan wyłączysz w Skanerze, w sekcji „Automatyczny skan”.

## 2026-11-20 (103) — Dostawa Vinted: znacznik „bezpłatna” ze strony już się nie liczy

- **Błąd:** filtr „Dostawa: bezpłatna” pokazywał oferty Vinted, które po zalogowaniu mają płatną dostawę. Były to oferty ze znacznikiem `isFree` na stronie widzianej bez logowania (dostawa tylko do punktu, np. 8,85 zł → 0 zł). Teraz liczy się cena regularna także przy nich.
- Naprawa zapisanych danych, raz przy starcie: na kopii bazy 23 oferty „bezpłatne” → 4 dostają cenę regularną z zapisanej strony, 19 wraca do „nieznana” i uzupełni się w tle. Wszystkie 23 były po polsku, więc rozpoznanie się nie zmienia. Po naprawie: 0 bezpłatnych, 3176 płatnych, 1662 nieznane.
- Ograniczenie: prawdziwej darmowej dostawy (u Ciebie po zalogowaniu „od 0 zł”, np. Angelfall tom 2) nie da się odczytać. Bez logowania Vinted pokazuje każdą ofertę jako „od 0 zł”, a strona takiej oferty niczym nie różni się od płatnych (sprawdzone na 10 losowych). Aplikacja nie loguje się na Vinted, więc filtr „bezpłatna” będzie dla Vinted pusty, a wyjątek „obcojęzyczne z darmową dostawą zostają” (wpis 90) przestaje działać.

## 2026-11-20 (102) — Dwa nowe źródła: Lagano i Vanaheim (Warhammer)

- **Lagano** i **Vanaheim** — księgarnie z nowymi książkami, czytane po kategorii Warhammer / Black Library jak antykwariaty (raz na 20 h, potem dopasowanie do fraz). Lagano: 124 książki na 6 stronach, Vanaheim: ok. 160 na 6 stronach. Oferty są liczone jako „Nowe w sklepie”.
- Prawie każda oferta ma ISBN już na liście (Lagano 24 z 24 na stronie 1, Vanaheim 29 z 30), więc trafia do wydania bez kolejki decyzji.
- Fraza „Warhammer” znajduje wszystkie książki z tych kategorii, także te, których tytuł nie nazywa uniwersum („Alpharius: Głowa Hydry”).
- Książki niedostępne nie są ofertami: w Lagano „Niedostępny”, w Vanaheim „Niedostępny do zamówienia” (cała strona 6 z 12 pozycjami).
- Adres `?gatunek=warhammer` z Lagano jest filtrem zakazanym w `robots.txt` — skan czyta zamiast niego kategorię `/ksiazki/warhammer/` z tymi samymi książkami.
- Nowe źródła trzeba zaznaczyć w formularzu skanu albo w profilu — zapisane profile ich nie mają. Pełnego skanu nie uruchamiałem.

## 2026-11-20 (101) — Ostrzejsze sprawdzanie tytułu przy przypisaniu po ISBN

- **Błąd:** oferta trafiała do wydania o swoim ISBN, jeśli z jego tytułem łączyło ją choćby jedno słowo, także samo „Warcraft”, „Pratchett” czy „Dragonlance”. Teraz wspólne uniwersum, cykl albo autor nie wystarczą: gdy reszta tytułu się różni („Kolor magii” kontra „Straż! Straż!”), oferta idzie do kolejki decyzji.
- Ta sama reguła działa w „Podejrzanych przypisaniach”. Na kopii bazy (2605 przypisań automatycznych) lista miała wcześniej 0 pozycji, teraz ma 42. Większość to inna książka (np. „Fourth Wing” → „Onyx Storm”) albo cała trylogia lub zestaw przypisane do jednego tomu. Część to fałszywe alarmy (np. „Warcraft początek” → „Warcraft: oficjalna powieść filmu”), które zatwierdza się jednym kliknięciem „To prawidłowe”.
- Nic nie jest przepinane samo. Przypisania ręczne i ISBN wpisany ręcznie w kolejce nie są sprawdzane.

## 2026-11-17 (100) — Całe uniwersa w „Szukaj po serii”: Warhammer, Forgotten Realms, Dragonlance

- Źródła → formularz skanu → „Szukaj po serii” ma pięć nowych list, każdy polski tytuł jako osobna fraza:
  - **Warhammer — wszystko** (174 tytuły): Herezja Horusa, Warhammer 40 000, Fantasy i Age of Sigmar razem;
  - **Warhammer 40 000** (61): Duchy Gaunta, Prymarchowie, Ognisty Brzask, Eisenhorn, Kosmiczny Wilk, Bitwy Kosmicznych Marines i inne;
  - **Warhammer Fantasy i Age of Sigmar** (65): Gotrek i Felix (także w Age of Sigmar), Malus, Czasy Końca, Ulrika, Thanquol, Archaon i starsze tomy Czarnej Biblioteki;
  - **Forgotten Realms** (88): Legenda Drizzta do „Króla orków”, Cunningham, Wojna Pajęczej Królowej, Wrota Baldura, antologie „Krainy…” i inne wydane po polsku;
  - **Dragonlance** (49): Kroniki, Legendy, Wojna Dusz, Bohaterowie, Mroczny Uczeń i inne wydane po polsku.
- Tytuł, który sam jest zwykłym słowem, ma dopisane nazwisko autora albo nazwę uniwersum: „Ojczyzna Salvatore”, „Smoki Dragonlance”, w liście zbiorczej także „Legion Abnett”. Sprawdzone na żywo na kopii bazy (Vinted): „Ojczyzna” dała 314 ofert, z czego 3 to Salvatore, i czytała 10 stron; „Ojczyzna Salvatore” — 4 oferty, wszystkie trafne, 1 strona.
- Źródła list: katalog wydawcy (copcorp.pl), polska Wikipedia i tytuły rozpoznane po ISBN w katalogu. Nowsze tomy Drizzta (po „Królu orków”) i część starych wydań Warhammera mogą brakować — frazy można dopisać ręcznie przed skanem.
- Duży skan trwa: przy 174 frazach i kilku źródłach to raczej godzina niż minuty (Vinted czyta każdą frazę osobno, Allegro Lokalnie co 8 s). To skan ręczny — nie zmienia profili ani harmonogramu.

## 2026-11-17 (99) — Ocena okazji; profile: rozpoznane i ofert na wydanie

- **Okazje:** przy każdej okazji cztery przyciski — „Trafna”, „Złe przypisanie”, „Inny stan / zestaw”, „Wycena zawyżona”. Nad listą podsumowanie, np. „Ocenione: 12 — trafna 7 (58%) · złe przypisanie 3 … przy wiarygodności średniej trafne 4 z 6”. Po to, żeby zmierzyć, jak często lista ma rację, zanim zaczniemy jej ufać przy zakupach.
- Ocenione okazje znikają z listy (zostają do odświeżenia widoku, z przyciskiem „Cofnij”); pole „Pokaż ocenione” pokazuje je z powrotem. Ocena zapamiętuje cenę, wycenę i wiarygodność z chwili oceny, więc liczy się też wtedy, gdy oferta przestanie być okazją.
- Ocena niczego nie zmienia w katalogu: złe przypisanie poprawiasz jak dotąd w szczegółach oferty (klik w tytuł).
- **Źródła → Skuteczność fraz → Profile skanu:** nowe kolumny „Rozpoznane” i „Ofert na wydanie”. Na kopii bazy fraza „Fourth Wing” ma 310 rozpoznanych ofert na 10 wydań (31 na wydanie), a „Warhammer” 211 na 129 (1,6) — tłok na kilku tytułach kontra szeroki wybór. Razem ze „Sprzedane w 14 dni” to dane do decyzji nisza / szeroki rynek; pierwszy wynik nowego profilu „Pomiar: szeroki rynek” po 01.12.

## 2026-11-17 (98) — Tezeusz przez strony autorów; profil „Pomiar: szeroki rynek”

- **Tezeusz** jest czytany przez strony autorów (`/autor/terry-pratchett`), a nie przez wyszukiwarkę, której `robots.txt` serwisu zakazuje. Frazy-nazwiska działają jak dotąd i czytają całą bibliografię autora (Pratchett: 24 strony). Frazy, które nie są nazwiskiem („Warcraft”, „Świat Dysku”), z Tezeusza nic już nie przynoszą — ich książki łapią strony autorów (Pratchett, Golden, Knaak, Abnett, McNeill, King). Na kopii bazy z Tezeusza było 277 ofert, z czego 104 przyszły przez „Świat Dysku”, a 21 przez „Warcraft”. Wcześniej znalezione oferty zostają.
- **Nowy profil „Pomiar: szeroki rynek”** (tylko Vinted, 8 fraz): Fourth Wing, Iron Flame, Onyx Storm, Sarah J. Maas, Wiedźmin, Sapkowski, Brandon Sanderson, Harry Potter. Służy do porównania w statystykach fraz, jak szybko sprzedaje się szeroki rynek, a jak nisza. Dodawany raz przy starcie; po usunięciu nie wraca.
- Automatyczny skan uruchamia profile po kolei co 12 h, więc każdy profil będzie skanowany co 36 h zamiast co 24 h. Gdy pomiar się skończy, usuń profil albo wybierz w harmonogramie jeden profil.

## 2026-11-17 (97) — Gotowe profile skanowania; Dedalus bez legalnego dostępu

- Profile „Uniwersa” i „Autorzy i cykle” dostały nowe frazy i wszystkie działające źródła (14 zamiast 5). Zmienione zostały tylko dlatego, że od założenia 07.11 były nietknięte — profil edytowany ręcznie nie jest ruszany. Zmiana dzieje się raz, przy starcie aplikacji.
- **Uniwersa** (11 fraz): dotychczasowe 6 oraz „Zapomniane Krainy”, „Diablo”, „StarCraft”, „Star Wars”, „Gwiezdne Wojny” — wszystkie uniwersa zdefiniowane w katalogu, także pod polską nazwą.
- **Autorzy i cykle** (14 fraz): dotychczasowe 10 oraz „Duchy Gaunta”, „Przygody Gotreka i Felixa”, „Kosmiczny wilk”, „Drizzt”. Raport fraz na kopii bazy: te cykle mają 6–21 rozpoznanych ofert, z których część nie łapie żadna obecna fraza.
- Celowo bez pojedynczych słów z tytułów („Mort”, „Piramidy”, „Zabójca”, „Legion”): na kopii bazy „Zabójca” dał 720 ofert, rozpoznanych 63; „Maskarada” 173 i 2.
- **Dedalus.pl** — „brak legalnego dostępu”, jak Allegro i OLX: `robots.txt` zakazuje adresu wyszukiwania, a od 11.11 każde zapytanie kończy się CAPTCHA. Nie jest już skanowany ani pokazywany jako awaria.
- Więcej fraz to dłuższy skan: Vinted czyta każdą frazę osobno, antykwariaty raz na 20 h niezależnie od liczby fraz.

## 2026-11-17 (96) — Profil pokazuje źródła, których nie skanuje

- Źródła → nad frazami: „Profil **Uniwersa** nie skanuje działających źródeł (10): Skupszop.pl, BlackBooks.pl, …” z przyciskami „Dodaj do profilu” i „Nie teraz”. Profil zapisany przed dodaniem źródła nigdy go nie skanował, także w skanie automatycznym, bo harmonogram uruchamia zapisane profile.
- Na kopii bazy: oba profile („Uniwersa”, „Autorzy i cykle”) mają 5 źródeł, z czego Dedalus jest blokowany (CAPTCHA). Skan automatyczny 17.11 czytał 4 źródła i dał 23 nowe oferty; ręczny skan 16.11 z 15 źródłami — 218. Skupszop: 157 z 199 ofert rozpoznanych po ISBN bez kolejki decyzji.
- Źródła niedziałające (np. Dedalus) nie są proponowane. „Nie teraz” ukrywa podpowiedź do czasu, aż pojawi się kolejne nowe źródło.

## 2026-11-17 (95) — Poprawki po przeglądzie kodu

- **Błąd:** obcojęzyczna oferta Vinted z bezpłatną dostawą była przyjmowana tylko przy pierwszym odczycie. Przy następnej frazie albo kolejnym skanie odpowiedź brana z pamięci podręcznej nie miała ceny dostawy, więc oferta była odrzucana jako obce wydanie, a po pełnym skanie wyglądała na sprzedaną („nie widziana”). Pamięć podręczna zapisuje teraz cenę dostawy, a cena zapisana przy ofercie ma pierwszeństwo.
- **Błąd:** książka z jednym prawdziwym wydaniem mogła mieć „zależnie od wydania” i zakres cen, bo do porównania wliczał się koszyk „nieznane wydanie”. Ten koszyk już się nie liczy.
- **Błąd:** uzupełnianie ceny dostawy w tle mogło w kółko czytać te same strony, które kończyły się błędem (przekierowanie, nie-HTML, 5xx), i nie dochodzić do reszty kolejki. Po 3 nieudanych próbach strona jest pomijana jak usunięta.
- **Błąd:** zdjęcie oferty Skupszop bez okładki nie dało się pobrać ze strony produktu (aplikacja oczekiwała tam JSON-a). Teraz JSON jest oczekiwany tylko od API listy.
- **Błąd:** „Okazje” pisały „1 ofert”, „2 ofert”, „2 sprzed.” — teraz „1 oferta”, „3 oferty”, „2 sprzedaże”.
- Listy i strona książki szybciej liczą wycenę: nowy indeks na dacie pierwszego zobaczenia oferty.

## 2026-11-16 (94) — Dostawa Vinted: cena regularna zamiast promocyjnego 0 zł

- **Błąd:** prawie każda oferta Vinted miała „Dostawa: bezpłatna” (2371 z 2385 odczytanych), przez co przy „Tylko polskie wydania” wpadały ogłoszenia obcojęzyczne (19 angielskich, 1 czeskie). Vinted pokazuje niezalogowanemu promocyjną cenę 0 zł (rabat 100%), której Ty nie dostajesz. Teraz liczy się cena regularna („od 7,05 zł”); dostawa jest bezpłatna tylko wtedy, gdy strona sama tak ją oznacza albo cena regularna wynosi 0 zł.
- Naprawa zapisanych danych, raz przy starcie: 648 ofert dostaje cenę regularną z zapisanej strony, 1723 wracają do „nieznana” i uzupełnią się w tle (6 stron co 3 minuty — razem z wcześniej czekającymi ok. 30 godzin pracy aplikacji).
- 20 ofert obcojęzycznych traci automatyczne przypisanie i jest rozpoznawanych ponownie: na kopii bazy 18 zostało odrzuconych jako wydania obce (widać je w „Ostatnie decyzje”, można cofnąć), 2 podręczniki do gier zostają w „Gry / obce”. Ręczne przypisania, zestawy i oferty z decyzją nie są ruszane. Dzieła założone w katalogu przez te oferty zostają — puste można usunąć ręcznie.
- Nie sprawdzone: ogłoszenie z naprawdę bezpłatną dostawą — w danych nie było ani jednego, więc oznaczenie strony (`isFree`) jest przyjęte bez przykładu.

## 2026-11-16 (93) — Pięć nowych źródeł: Skupszop i cztery antykwariaty

- **Skupszop.pl** — szukany po frazie przez API listy produktów, które sklep wprost dopuszcza w `robots.txt`. Każda książka ma ISBN (rozpoznanie bez kolejki decyzji), stan i cenę; ceny pozostałych stanów („jak nowa: 29,75 zł (9 szt.)…”) są w opisie oferty. Jedna oferta na książkę — ta, którą sklep pokazuje jako pierwszą.
- **Antykwariat Toruń**, **Kultura Wraca**, **Bookway**, **Antykwariat Gryf** — czytane po kategorii fantastyki, jak dotychczasowe antykwariaty (raz na 20 h, potem dopasowanie do fraz). Rozmiar: Toruń ok. 470 pozycji (27 stron), Kultura Wraca ok. 130 stron po 24, Gryf 46 stron po 16 (wyprzedane egzemplarze zostają na liście i nie są ofertami), Bookway po 11 na stronę.
- Nowe źródła trzeba zaznaczyć w formularzu skanu albo w profilu — zapisane profile ich nie mają.
- Sprawdzone na żywo po jednej stronie z każdego źródła (Skupszop: 28 ofert dla „Świat Dysku”). Pełnego skanu nie uruchamiałem.

## 2026-11-16 (92) — Raport fraz na zapisanych wynikach

- Nowy skrypt `node scripts/query-yield-report.mjs <kopia.sqlite> [--profile "Nazwa"]` (tylko odczyt, bez internetu): dla każdej frazy liczy oferty, oferty znalezione tylko nią, rozpoznane oferty i odsetek duplikatów; wskazuje frazy-szum i proponuje nowe (tytuł bez podtytułu, nazwisko + tytuł, seria/uniwersum, konkretny tom, inna nazwa uniwersum) z rozpoznanych wydań.
- Na kopii bazy: 71 fraz, 5283 oferty, 2669 rozpoznanych; tylko 224 (4%) znalazła więcej niż jedna fraza. Szum (<5% rozpoznanych): „Eryk” (354 oferty, 0 rozpoznanych), „Piramidy” (176/1), „Maskarada” (173/2), „Mort” (92/0) i 4 inne.

## 2026-11-15 (91) — Filtr dostawy w „Ofertach”

- Nowa lista obok „Stanu ogłoszenia”: każda dostawa / bezpłatna / płatna / nieznana. „Nieznana” to oferty, których koszt dostawy nie został jeszcze odczytany (inne źródła niż Vinted i oferty Vinted czekające na uzupełnienie).

## 2026-11-15 (90) — Obcojęzyczne z darmową dostawą zostają

- Przy włączonym „Tylko polskie wydania” oferta Vinted w innym języku (np. angielska) nie jest już odrzucana, jeśli ma bezpłatną dostawę. Trafia do katalogu i weryfikacji jak polska; płatna dostawa — odrzucana jak dotąd.
- Oferty Vinted nie są już odsiewane po tytule na stronie wyników („english”, „(eng)”) — o języku decyduje pole „Język” i tytuł dopiero po odczycie strony ogłoszenia, bo dopiero tam widać dostawę. Skan czyta przez to trochę więcej stron Vinted.
- Oferty odrzucone wcześniej jako obcojęzyczne nie wracają same.

## 2026-11-15 (89) — Koszt dostawy w ofertach Vinted

- Przy ofercie Vinted widać teraz „Dostawa”: najtańsza cena wysyłki, jaką podaje strona ogłoszenia („od 9,99 zł”), albo „bezpłatna”, gdy Vinted daje 100% rabatu na dostawę (np. 7,05 zł → 0 zł).
- Odczyt idzie przy okazji czytania strony ogłoszenia (i tak czytanej dla języka) — bez dodatkowych zapytań. Wcześniej zapisane oferty Vinted (dostępne, zarezerwowane lub niepotwierdzone) uzupełniają się w tle: 6 stron co 3 minuty, przez wspólną bramkę z limitami, najdroższe najpierw; każda strona czytana jest raz. Przy blokadzie Vinted zadanie czeka 30 minut. Sprawdzanie dostępności oferty też zapisuje koszt dostawy, bo czyta tę samą stronę.

## 2026-11-15 (88) — Nowa zakładka „Okazje”

- Menu boczne: „Okazje” — dostępne oferty co najmniej 20% i 5 zł poniżej wartości swojego wydania. Przy każdej: cena, ile egzemplarz jest wart (z przedziałem), różnica w zł i %, wiarygodność wyceny, link do ogłoszenia i do strony książki. Na kopii bazy: 150 okazji, z czego 56 z wyceną średnią lub wysoką.
- Wartość liczona jest z pozostałych ofert i sprzedaży tego samego wydania (sama oferta nie zaniża swojego punktu odniesienia), dla stanu danego egzemplarza. Potrzebne są co najmniej dwie inne ceny; same ceny nowych książek w sklepach nie wystarczają. Zestawy i oferty przypisane do „wydania nieustalonego” są pomijane.
- Domyślnie widać tylko wyceny o średniej i wysokiej wiarygodności; pole „Pokaż też wyceny o niskiej wiarygodności” odsłania resztę. Sortowanie: różnica w zł, rabat %, najnowsze, najniższa cena.
- Oferta 70% i więcej poniżej wyceny dostaje ostrzeżenie „sprawdź przypisanie” — tak duża różnica częściej oznacza pomyłkę w przypisaniu niż okazję.
- Na telefonie „Okazje” są w dolnym pasku w miejscu „Źródeł”; stan źródeł jest na ekranie „Dziś”, a widok „Źródła” otwiera stamtąd przycisk „Nowy skan” i kafelek „Następny skan”.

## 2026-11-15 (87) — Wycena: poprawki po sprawdzeniu na danych

- Książka, której wydania różnią się ceną (1,5× i więcej), pokazuje zakres wycen wydań — np. „Wartość 26–43 zł zależnie od wydania” — zamiast jednej kwoty mieszającej twardą oprawę z miękką. Wycena każdego wydania jest na stronie książki.
- **Błąd:** egzemplarz w stanie zadowalającym zaniżał wycenę zamiast ją podnosić (jego cena była mnożona przez 0,8, a opis mówił „+25%”). Teraz +25%; stan nieznany nie zmienia ceny; cena sklepowa liczona równo jako 60%.
- **Błąd:** trend „sprzedający podnieśli ceny o 31%” wynikał z 3 ofert na 47, w tym promocji sklepu. Teraz liczą się tylko używane egzemplarze, co najmniej 3 zmienione ceny i co najmniej co czwarta oferta; opis mówi wprost: „5 z 14 ofert zmieniło cenę, zwykle o −10%”.
- **Błąd:** powód „stan zadowalający +25%” pojawiał się przy 468 z 500 wycen, choć w 427 nie było takiego egzemplarza. Teraz wymienia tylko korekty faktycznie użyte.
- „Duża podaż” liczy tylko używane egzemplarze, bez nowych książek w sklepach. „N nowych ofert w ostatnich 30 dniach” pojawi się dopiero, gdy katalog będzie zbierał oferty od co najmniej 60 dni. Wiarygodność „wysoka” wymaga 3 sprzedaży z ostatniego roku.

## 2026-11-15 (86) — Szacowana wartość rynkowa książki

- Książki → Lista: pod każdą książką linia „Wartość ~80 zł 70–95 zł · wiarygodność średnia · 2 sprzedaże, 3 oferty”; po najechaniu — pełne uzasadnienie.
- Strona książki: ramka „Szacowana wartość rynkowa” z kwotą, przedziałem, wiarygodnością (wysoka / średnia / niska / brak danych) i listą powodów; przy każdym wydaniu jego własna wycena.
- Jak liczona: potwierdzone sprzedaże ważą ×3, ceny ofertowe liczone 10% niżej, nowe książki ze sklepów tylko jako słaba wskazówka (ok. 60% ceny); ceny sprowadzone do egzemplarza w dobrym stanie; ceny nietypowe (daleko od reszty) pominięte; duża podaż przesuwa wycenę w dół. Opisuje też trend cen sprzedaży (90 dni) i obniżki sprzedających. Bez danych — „brak danych do wyceny” zamiast kwoty.

## 2026-11-15 (85) — Drobne: odmiana „oferty” w palecie, odstęp dolnego paska

- Paleta poleceń: „2 oferty” zamiast „2 ofert” (poprawna odmiana: 1 oferta, 2–4 oferty, 5 ofert, 22 oferty).
- Telefon: etykieta „Ustawienia” w dolnym pasku nie dotyka już prawej krawędzi — odstęp od krawędzi ekranu 13 px przy szerokości 390 px (wcześniej ok. 2 px).

## 2026-11-15 (84) — Ustawienia: Allegro i OLX — „brak legalnego dostępu”

- Ustawienia → „Źródła skanowania”: Allegro i OLX mają ten sam opis co na „Dziś” — „brak legalnego dostępu” — zamiast „wymaga CAPTCHA · jeszcze nigdy nie zadziałał” i „odmowa dostępu (403)”.

## 2026-11-15 (83) — Dziś: działające źródła zwinięte do jednej linii

- Dziś → „Źródła”: źródła niedziałające i bez dostępu są wypisane osobno, a działające zwinięte do jednej rozwijanej linii „N działa” (na kopii bazy „8 działa”). Sekcja ma 281 px wysokości zamiast 611 px.

## 2026-11-15 (82) — Książki: równe liczniki, stała kolejność narzędzi

- Książki → Lista: liczniki „1 wyd. · 1 oferta” stoją na tej samej wysokości względem wiersza „wydawca · rok” w każdym wierszu — z plakietką „Niezweryfikowane” i bez, z plakietkami „brak: rok / wydawca” i bez (pomiar na kopii bazy, 14 pierwszych wierszy: odstęp 4 px we wszystkich; wcześniej 4 px lub 7 px).
- „Narzędzia katalogu”: rozwinięcie jednego narzędzia nie zmienia już kolejności pozostałych przycisków (Wydawcy i serie, Zasilanie katalogu, Usunięte z katalogu). Na kopii bazy pozycje przycisków po rozwinięciu „Zasilania” były przestawione; teraz kolejność jest stała.

## 2026-11-15 (81) — Źródła: ostatni skan i skuteczność fraz na pełną szerokość

- Źródła (≥ 1100 px): „Ostatni skan” i „Skuteczność fraz i profili skanu” zajmują pełną szerokość (1264 px zamiast 618 px przy 1440 px); tabela skuteczności mieści się bez ucinania kolumn (szerokość tabeli 1226 px, bez przewijania poziomego). Formularz skanu i „Stan źródeł” stoją obok siebie jak dotąd.

## 2026-11-15 (80) — Duplikaty: wyrównane przyciski, tytuły jako linki

- Kolejka → Możliwe duplikaty: przyciski „Połącz w jedno” i „To różne książki” są wyrównane do prawej — na kopii bazy wszystkie 7 grup ma przycisk w tym samym miejscu (x = 1103 px; wcześniej 749–809 px). Tytuł każdego dzieła jest linkiem do jego strony książki.

## 2026-11-15 (79) — Weryfikacja: większe zdjęcie, widoczny przycisk szczegółów

- Kolejka → Weryfikacja: zdjęcie oferty jest większe — na komputerze 280 × 373 px zamiast 170 × 227 px, na telefonie 120 × 160 px zamiast 72 × 108 px (pomiar na kopii bazy).
- „⋯” otwierający „Szczegóły i ponawianie” identyfikacji to teraz przycisk z ramką, w całości widoczny (był ucięty na krawędzi ramki), z podpowiedzią „Szczegóły i ponawianie”.
- Tekst zastępczy pola szukania w Weryfikacji skrócony do „Szukaj ofert” (był ucięty: „…źródle lub IS”).

## 2026-11-15 (78) — Zakładka „Zestawy?”: przycisk „Zestaw” w pasku akcji

- Kolejka → „Zestawy?”: akcja **„Zestaw” (Z)** jest przyciskiem w głównym pasku akcji, obok „Odrzuć” i „Pomiń”. W pozostałych zakładkach zostaje w menu „Więcej”.

## 2026-11-15 (77) — „Nowy skan” przewija do formularza

- **Błąd:** na telefonie „Nowy skan” na ekranie „Dziś” otwierał „Źródła” na górze, a formularz skanu był ok. 1100 px niżej, pod „Stanem źródeł”. Teraz po kliknięciu ekran przewija się od razu do formularza (na kopii bazy formularz jest u góry ekranu, przewinięcie o 1106 px).

## 2026-11-15 (76) — Telefon: panel wsadowy w Kolejce

- **Błąd:** na telefonie w Kolejce → „Szybkie” (i „Do dodania”) panel wsadowy („N pewnych dopasowań → Zatwierdź zaznaczone”) był ukryty. Teraz jest nad listą ofert (na kopii bazy: „22 pewnych dopasowań”, przycisk „Zatwierdź zaznaczone (22)”); karty przewijają się w obrębie panelu (do 45% wysokości ekranu). Poprawiono też odświeżanie panelu po zmianie zakładki, gdy wcześniej nic nie było zaznaczone.

## 2026-11-15 (75) — Oferty: filtr stanu ogłoszenia i stan w kolumnie

- W „Oferty” jest nowy filtr **„Stan ogłoszenia”**: aktywne / sprzedane / niewidziane (obok filtra statusu). Sprzedane na Vinted to cena odniesienia, więc teraz da się je wylistować.
- Kolumna „Katalog · ogłoszenie” pokazuje pod „W katalogu” stan ogłoszenia (np. „Sprzedana”, „Widziana dziś”, „Dawno niewidziana”), a nie tylko przypisanie.
- Wybór: „aktywne” = znalezione w skanie lub potwierdzone na stronie; „niewidziane” = brak w ostatnim skanie lub zdjęte. Dane z kolumny `offers.availability`, bez migracji; „zarezerwowane” nie ma osobnej pozycji filtra.

## 2026-11-15 (74) — Podejrzane przypisania: komunikat przy braku pozycji

- **Błąd:** w Kolejce → „Podejrzane przypisania” przy 0 pozycji ekran był pusty (panel był ukryty mimo komunikatu). Teraz widać komunikat „Każda przypisana oferta ma w tytule coś wspólnego ze swoim wydaniem.”

## 2026-11-15 (73) — Lista książek na pełną szerokość po powrocie ze strony książki

- **Błąd:** po otwarciu książki i powrocie („← Wszystkie książki”) widoki „Okładki” i „Serie” zajmowały tylko część szerokości (746 px przy 1440 px), prawa część ekranu była pusta. Lista ma teraz pełną szerokość zawsze, gdy strona książki nie jest otwarta.

## 2026-11-15 (72) — Lista książek nie zwija się po usunięciu; krótszy pasek serii

- **Błąd:** po rozwinięciu listy „Książki” ponad 100 pozycji kliknięcie „×” (albo „Cofnij”) zwijało ją z powrotem do 100. Teraz przy tych samych filtrach lista zostaje rozwinięta — sprawdzone na kopii bazy: 400 widocznych pozycji przed usunięciem, po nim i po „Cofnij”.
- **Błąd:** w widoku „Serie” pasek skrótów miał po jednym przycisku na każde uniwersum (83 na kopii bazy) i, przyklejony do góry, zasłaniał prawie cały ekran. Teraz to jedna linia: lista „Wszystkie serie (83)…” i 10 największych serii; na wąskim ekranie przewija się w poziomie.

## 2026-11-15 (71) — Usuwanie książki jednym kliknięciem z listy

- Na liście „Książki” (widok „Lista” i „Okładki”) po najechaniu na książkę na okładce pojawia się **„×”**. Kliknięcie od razu usuwa książkę z katalogu, bez okna potwierdzenia — działa jak „Usuń z katalogu” (oferty odrzucone, nowe oferty tej książki odrzucane same). Na telefonie „×” jest widoczny stale.
- „Usuń z katalogu” na stronie książki też nie pyta już o potwierdzenie.
- Zabezpieczeniem jest **„Cofnij”** w powiadomieniu albo „Narzędzia katalogu → Usunięte z katalogu → Przywróć”. Sprawdzone na kopii bazy: usunięcie i „Cofnij” przywracają książkę razem z jej ofertą.

## 2026-11-15 (70) — Krótsza strona książki: kafelki cen, akcje, oferty z linkami

- Na górze strony książki są **kafelki**: najniższa cena i mediana dostępnych ofert, mediana sprzedanych na Vinted, **cena skupu** (najwyższa wycena skupksiazek.pl spośród wydań z ISBN-13) i liczba ofert. Przykład z kopii bazy, „Fourth Wing”: 20,00 zł / 40,00 zł (275 dostępnych) / 30,00 zł (15 sprzedaży) / skup 16,55 zł / 298 ofert.
- Pod tytułem jest **pasek akcji**: „Szukaj w skanerze” (wpisuje tytuł i autora jako frazę), „Sprawdź skup”, „Popraw dane” (także łączenie duplikatu), „Seria i tom”, „Uniwersum” i „Usuń z katalogu”. Formularze otwierają się pod paskiem, jeden naraz. Cena skupu jest widoczna na stronie książki także poza trybem handlowym.
- **Oferty** to krótka lista: najpierw dostępne od najtańszej, potem sprzedane (wyszarzone); 15 na start, reszta pod „Pokaż więcej”. Każda ma link **„Ogłoszenie ↗”** otwierający ogłoszenie w nowej karcie; kliknięcie wiersza nadal otwiera szczegóły oferty.
- Wykres cen, tabele wg rodzaju oferty, stanu i wariantu oraz pochodzenie danych są zwinięte w „Szczegóły cen i pochodzenie danych” na dole. Wybór wariantu cenowego wydania jest w tej samej linii co wydanie. Strona „Fourth Wing” ma teraz ok. 2 600 px wysokości zamiast ok. 9 000 px.
- **Błąd:** znak „?” przy „Wydanie nieustalone” rozciągał się na pół szerokości wiersza.
- **Błąd:** na telefonie strona książki miała dwa przyciski powrotu („Wróć do listy” i „← Wszystkie książki”); został jeden.

## 2026-11-14 (69) — Szybsze sprawdzanie języka na Vinted

- **Błąd:** oferty Vinted, na których stronie sprzedawca nie podał języka, były czytane od nowa w każdym skanie — około 110 stron na pełny skan (ok. 4 minuty przy tempie jednej strony na 2 s). Teraz wynik „brak języka” jest pamiętany przez 7 dni; po tym czasie strona jest czytana ponownie, bo sprzedawca mógł język uzupełnić.
- Pomiar na kopii bazy: skan z 14.11 wieczorem sprawdzał 1237 nowych ofert przez 63 minuty — to pierwszy skan nowych fraz (seria). Kolejne skany tych samych fraz czytają tylko nowe oferty (skany z 12–13.11: 22–41 stron, 5–7 minut).

## 2026-11-14 (68) — Usuwanie pozycji z katalogu

- Na dole strony książki („Książki” → wybrana książka) jest **„Usuń z katalogu”** — dla pozycji, które nie należą do kolekcji. Po potwierdzeniu (okno podaje liczbę wydań i ofert) książka znika z list razem z wydaniami, a wszystkie jej oferty są odrzucane i znikają z weryfikacji i z „Ofert”.
- Śmieć nie wraca: nowa oferta, która trafi na wydanie usuniętej książki albo ma jeden z jej numerów ISBN, jest odrzucana sama po każdym przebiegu identyfikacji.
- Wszystko da się cofnąć: „Cofnij” w powiadomieniu albo „Narzędzia katalogu → Usunięte z katalogu → Przywróć” przywraca książkę i każdą jej ofertę z przypisanym wydaniem. Pojedynczą ofertę można też otworzyć ponownie w „Ostatnich decyzjach” — blokada jej nie odrzuci drugi raz. Ręczne przypisanie ma pierwszeństwo przed blokadą.
- Nic nie jest kasowane z bazy: decyzje weryfikacji są niezmienne, więc usunięcie to ukrycie z blokadą. Oferty-zestawy, w których ta książka jest jednym z tomów, zostają.

## 2026-11-14 (67) — Skan po serii, do 200 fraz

- Nad polem fraz jest wybór **„Szukaj po serii”**: Świat Dysku (41 powieści), Herezja Horusa (tomy 1–48, z zapowiedziami) i Gotrek i Felix (17 głównych tomów). Wybór wstawia tytuły serii jako frazy; można je poprawić przed kliknięciem „Skanuj” i zapisać jako profil.
- Limit fraz w skanie i w profilu wzrósł z 10 do **200**. Więcej fraz to dłuższy skan: każda fraza jest osobnym zapytaniem w każdym wybranym źródle (antykwariaty czytają kategorię raz).

## 2026-11-14 (66) — Pięć antykwariatów internetowych jako nowe źródła

Nowe źródła do wyboru w skanerze: **BlackBooks.pl** (Gdańsk), **Antykwariat Conroy** (Kraków), **Szarlatan.pl** (Wrocław), **Stara Dobra Książka** (Gdynia) i **Antykwariat NWS** (Kraków). Ich oferty mają rodzaj „Antykwariat” i wspólny kolor.

- Antykwariaty nie są przeszukiwane frazą: skan czyta całą kategorię fantastyki / SF strona po stronie (tak pozwala ich `robots.txt`) i dopiero potem dopasowuje książki do fraz profilu. Książki, których żadna fraza nie nazywa, nie są zapisywane (liczone jako „temat”).
- Ta sama fraza w danym antykwariacie jest czytana najwyżej raz na 20 godzin; w kolejnych skanach tego dnia jest od razu oznaczona jako zrobiona. Pełny odczyt to ok. 250 stron (najwięcej BlackBooks i Stara Dobra Książka), więc pierwszy skan z antykwariatami trwa kilka minut dłużej. Szybki skan (najnowsze) ich nie obejmuje.
- Antykwariat Conroy podaje na liście ISBN, wydawcę, stan i wady — te oferty mają ISBN od razu. Pozostałe cztery podają tylko tytuł z autorem i cenę.
- Oferta, która zniknęła z przeczytanej do końca kategorii, jest oznaczana jako niewidziana; sprzedane egzemplarze Starej Dobrej Książki („Egzemplarz sprzedany”) nie są ofertami.
- Regulaminy pięciu sklepów nie zakazują automatycznego odczytu. **Skupszop.pl nie jest dodany:** fraza idzie w parametrze `filters[keyword]` razem z `routeName` ze strony wyszukiwania, której `robots.txt` zakazuje — do ustalenia przez właściciela.

## 2026-11-14 (65) — Rozpoznanie nowych źródeł i robots.txt obecnych

Bez zmian w aplikacji; wynik jest w `docs/SOURCES-ACCESS-2026-11.md` (sekcja z 14.11).

- **Skupszop.pl** to najlepszy kandydat na nowe źródło używanych książek: jego `robots.txt` wprost dopuszcza API listy produktów, a odpowiedź ma ISBN, stan egzemplarza, cenę dla każdego stanu i dostępność (200 678 używanych pozycji). Nie ustaliłem jeszcze zapisu frazy w adresie zapytania i nie czytałem regulaminu — dlatego źródło nie jest dodane.
- **Do decyzji:** `robots.txt` Tezeusza zakazuje adresu wyszukiwarki, z którego korzysta skan (`/szukaj?`), a Dedalusa — `/s?q=`. Vinted, Empik i Allegro Lokalnie dopuszczają używane adresy. Propozycja w dokumencie: Dedalus do „brak legalnego dostępu”, Tezeusz przez strony autorów albo produktów.
- Sprzedajemy.pl (zapytania zakazane), TaniaKsiazka (wyszukiwarka zakazana), Bonito i TakCzytam — ocena w tabeli.

## 2026-11-14 (64) — Allegro Lokalnie: mniej stron ofert naraz

Allegro Lokalnie odpowiedziało CAPTCHA po 13 stronach ofert czytanych z rzędu (12.11), a 14.11 odmówiło także skanu; to źródło daje 62 z 82 decyzji w kolejce, więc blokada kosztuje najwięcej.

- Zadania w tle (sprawdzanie dostępności i czytanie szczegółów ze strony oferty) czytają najwyżej **4 strony Allegro Lokalnie na rundę**; reszta czeka na następną rundę (dotąd do 20 przy dostępności i do 40 przy szczegółach). Odstęp 8 s między zapytaniami i pauza po blokadzie bez zmian. CAPTCHA nadal nie jest omijana.
- Skutek uboczny: szczegóły i dostępność ofert z tego źródła uzupełniają się wolniej. Czy to wystarczy, żeby blokady ustały, okaże się po kilku dniach pracy aplikacji — nie da się tego sprawdzić bez zapytań do serwisu.

## 2026-11-14 (63) — Czas skanu, cena sprzedaży z małej próby, test parsera Tezeusza

- **Dziś → „Ostatni skan”** pokazuje, ile trwał skan („· trwał 12 min”). Czas jest zapisywany przy każdym nowym skanie; starsze skany go nie mają. Pozwala ocenić koszt dodania frazy albo źródła.
- **Strona książki:** przy „Sprzedane na Vinted” z mniej niż 3 sprzedaży stoi „mało danych” (na kopii bazy 351 z 415 książek z ofertami nie ma żadnej zaobserwowanej sprzedaży, 55 ma jedną).
- **Tezeusz:** sprawdzone jednym zapytaniem przez bramkę — wyszukiwarka sklepu pokazuje z ceną egzemplarze, które strona produktu ma już jako „Produkt niedostępny”, więc oferta może być „nowa” i po chwili „Niedostępna”; to poprawne zachowanie, nie błąd. Karty bez ceny („Niedostępny”) nie są ofertami. Parser ma teraz test na zapisanym fragmencie strony (`fixtures/marketplaces/tezeusz-cards-captured.json`).

## 2026-11-14 (62) — Poprawki po przeglądzie aplikacji (część 1)

- **Błąd:** dzieło w katalogu nazwane samym nazwiskiem autora (np. „Terry Pratchett”, utworzone z ogłoszenia bez tytułu) było proponowane jako „pewne dopasowanie” (95%) dla każdej oferty tego autora — na kopii bazy 2 z 3 kart w siatce „Szybkie”. Taki wpis nie jest już nigdy propozycją po tytule.
- **Błąd:** oferty z ceną 10 000 zł i więcej zapisane przed wprowadzeniem limitu zachowywały tę cenę (2 oferty na kopii bazy, jedna otwierała listę zestawów). Jednorazowa naprawa przy starcie czyści takie ceny i ich odczyty w historii.
- **Błąd:** tytuł w formularzu „Utwórz wydanie z ogłoszenia” nie zostawia już samotnego cudzysłowu po usunięciu autora.
- **Błąd:** lista „Książki” pisała „1 ofert” i „3 ofert” zamiast „1 oferta”, „3 oferty” (to samo w „Możliwych duplikatach”); na telefonie plakietka „Niezweryfikowane” nie zasłania już tytułu, a liczniki nie nachodzą na „brak: rok / wydawca”.
- **Błąd:** na stronie książki przycisk „Dodaj książkę” nachodził na róg karty — jest tylko nad listą.
- **Źródła:** od 1100 px „Stan źródeł” stoi obok formularza skanu zamiast nad nim (formularz zajmował 620 z 1440 px, reszta była pusta). **Błąd:** kropki przy niedziałających źródłach były zielone — są czerwone jak na „Dziś”, przy Allegro i OLX szare.
- **Oferty:** kolumna „Stan” nazywa się „Katalog · ogłoszenie” i oprócz stanu w katalogu pokazuje stan ogłoszenia, gdy nie jest zwykły (Sprzedana, Niedostępna, Mogła zniknąć) — dotąd widać go było tylko na telefonie. Plakietka „Usunięta” nazywa się „Niedostępna”, tak jak w szczegółach oferty.

## 2026-11-14 (61) — Dokumentacja: jedno miejsce z ustaleniami i przepisami

Bez zmian w aplikacji.

- **`CLAUDE.md`** jest pełnym briefem na start pracy: co jest ustalone i o co nie pytać (jedna osoba, lokalnie, odsprzedaż na Vinted, polskie wydania, bez Allegro i OLX, handel odłożony), jak pracować, polecenia, gdzie co leży, przepisy „jak dodać trasę / migrację / zadanie w tle / źródło / widok / test” i tabela „co zaktualizować po zmianie”.
- **`docs/PRODUCT-DIRECTION.md`** ma sekcję „Założenia właściciela”.
- **`README.md`** ma spis „Dokumentacja — gdzie co jest” zamiast drugiego opisu architektury. Ścieżki bazy i polecenia kopii są opisane tylko w README; `PRODUCTION-CATALOG.md` i `docs/DATA-MIGRATION.md` do niego odsyłają.
- Przegląd interfejsu z 11.2026 przeniesiony do `docs/archive/`; archiwum ma `README.md` z informacją, że nie opisuje stanu bieżącego.

## 2026-11-14 (60) — Tańsza praca nad kodem: szybsze `verify`, schemat bazy w jednym pliku, więcej typów

Bez zmian w wyglądzie i działaniu aplikacji.

- **`npm run verify`: 70 s → 33 s.** Usunięty krok `check:syntax` (osobny proces `node --check` na każdy plik, 33 s); błędy składni i tak zatrzymuje lint, który parsuje każdy plik.
- **`docs/SCHEMA.sql`**: aktualny schemat bazy (57 tabel z indeksami i wyzwalaczami) w jednym pliku zamiast w 41 migracjach. Generuje go `node scripts/dump-schema.mjs`; test `test/schema-doc.test.mjs` nie przejdzie, gdy po nowej migracji plik jest nieaktualny.
- **Typy:** `// @ts-check` w 67 modułach zamiast 9 — 58 dodanych przeszły bez poprawek.
- **Trasy:** `trading-api.mjs` nazywa się `api-routes.mjs` (tabela `apiRoutes`) — większość jego tras to katalog, kolejka i ustawienia, nie handel. W `local-app.mjs` 57 tras nie powtarza już sprawdzenia „katalog otwarty”: handler, który bierze `catalog`, dostaje otwarty katalog albo żądanie kończy się 503 `CATALOG_DISABLED` (plik krótszy o 43 linie).
- **Usunięte** nieużywane moduły sprzed SQLite: `feed.mjs`, `rss.mjs`, `local-batch-scan.mjs` z testami (740 linii; zostają w historii Git). Narzędzia importu dawnej historii JSON zostały.
- **`local-app.mjs`: 2410 → 432 linie.** Skan jest w `scan-engine.mjs`, zadania w tle w `background-jobs.mjs`, wspólne elementy procesu w `app-runtime.mjs`, a 67 tras w pięciu plikach `routes/` (zdjęcia, weryfikacja, katalog, oferty, źródła). Żadne dwie trasy nie dopasowują tego samego żądania, więc kolejność tabel nie ma znaczenia. Sprawdzone na serwerze z pustą bazą: 21 adresów z każdego pliku tras odpowiada tak jak przedtem.
- **Testy serwera w `test/`:** 149 plików `*.test.mjs` przeniesionych z katalogu głównego, w którym zostało 113 plików zamiast 264. Jeden plik uruchamia `npm test -- test/nazwa.test.mjs`.
- Test importów pomija `scratch/` (pliki robocze spoza Git).

## 2026-11-14 (59) — Style: plik na obszar, każdy selektor w jednym miejscu

Bez zmian w wyglądzie i działaniu. Style obliczone każdego elementu (także `::before`, `::after`, `::marker`, `::placeholder`, `::backdrop`) w 976 stanach — 61 widoków i stanów (okna, paleta poleceń, tryb skupienia, siatka wsadowa, „Odrzuć z regułą…”, puste listy, najechanie i fokus) × 390/1100/1440/1920 px × motyw jasny i ciemny × tryb handlu — są takie same przed i po każdym kroku (`node scripts/css-snapshot.mjs <port> <katalog> --verify`).

- **Pliki:** zamiast `app/app.css` (216 800 B, jedna linia do 3568 znaków) 12 plików w `app/styles/` dołączanych z `index.html` w stałej kolejności: tokeny i motywy, baza, powłoka, komponenty, Dziś, Kolejka, Książki, Oferty, Zestawy, Źródła, Ustawienia, tryb handlu. Razem 230 057 B po sformatowaniu Prettierem (najdłuższa linia 249 znaków); przesyłane z gzip: 42,4 KB → 49,0 KB.
- **Reguły:** 2164 → 1826. **Selektory zdefiniowane w więcej niż jednej regule tego samego kontekstu** (`@media`): 283 → 14; licząc z wariantami `@media`: 445 → 239. **`!important`:** 39 → 40 — 6 zbędnych usuniętych, ale kilka list selektorów rozdzielonych między pliki powiela swoje deklaracje.
- **Usunięte 199 selektorów**, które nie mogą niczego dopasować: wymagają klasy lub id, których nie ma w żadnym pliku aplikacji ani serwera (i żaden z 976 stanów ich nie pokazał).
- **Kolejność kaskady** jest kolejnością plików. 300 fragmentów reguł (16%) stoi w pliku późniejszego obszaru pod notatką „Z obszaru …”, bo muszą przyjść po tamtejszych regułach; 201 z 479 wariantów `@media` stoi zaraz za swoim komponentem (pozostałe przesunięte zmieniłyby wygląd).
- **Start aplikacji:** 68 zapytań zamiast 57 (11 arkuszy więcej, 58 statycznych zamiast 47; 228 KB zamiast 221 KB). Zwykłe przeładowanie: 71 zamiast 60, wszystkie arkusze odpowiadają 304 (10,7 KB).
- **Testy** nie czytają już tekstu CSS: zasady (kolory tylko jako zmienne, motyw ciemny zmienia tylko wartości, ukryte widoki, `[hidden]`, bezpieczny obszar paska na telefonie) sprawdzają sparsowane reguły wszystkich arkuszy (`app-styles.mjs`); zachowanie — `scripts/browser-smoke.mjs` (pola 16 px / 44 px na telefonie, cele 44 px i widoczny fokus w szczegółach oferty, ukryte przyciski weryfikacji, brak animacji przy ograniczeniu ruchu). Usunięte asercje, które sprawdzały tylko obecność napisu w `app.css`.

## 2026-11-12 (58) — Porządki w dokumentacji i jedno polecenie kontroli

Bez zmian w działaniu aplikacji.

- **README** mówi o bieżącym priorytecie (skaner, katalog, weryfikacja; handel odłożony) i odsyła po cel docelowy do `docs/PRODUCT-DIRECTION.md`. Jeden opis sześciu zakładek (Dziś, Kolejka, Książki, Oferty, Źródła, Ustawienia) zamiast dwóch, w tym starej tabeli z „Skaner” i „Do weryfikacji”. Kopia i przywracanie w jednej sekcji; naprawione polskie znaki w akapicie o cenach Empiku; zamiast wyliczanki migracji 104–132 jedno zdanie.
- **Zmienne środowiskowe** są tylko w tabeli `PRODUCTION-CATALOG.md` („Konfiguracja”): dopisane `BOOKFLIP_EDITION_GAPS` (wcześniej dopisek pod tabelą) i `BOOKFLIP_STORAGE`; każda z 24 nazw w tabeli jest używana w kodzie i żadnej używanej nie brakuje.
- **CHANGELOG** zawiera wpisy od 2026-11-10 (33 wpisy z tym, 59 KB zamiast 102 KB); 27 starszych jest w `docs/archive/CHANGELOG-do-2026-11-09.md`. Dokument jednorazowy `PROMPT-POPRAWKI-PO-PRZEGLADZIE.md` przeniesiony do `docs/archive/`.
- **Mapa repozytorium** (`docs/REPOSITORY-MAP.md`): jedna linijka na plik; dopisane pliki, których brakowało: 39 z katalogu głównego, 16 widoków, 7 z `app/core`, 4 źródła metadanych i 9 skryptów. Moduły nieosiągalne z serwera (`feed.mjs`, `rss.mjs`, import JSON, próba migracji, porównanie historii, dawna reidentyfikacja, skan wsadowy) opisane w „Elementach historycznych”.
- **`npm run verify`**: lint, składnia, typy, formatowanie i testy po kolei, stop na pierwszym błędzie (`scripts/verify.mjs`, działa w PowerShell i Git Bash). Repozytorium nie ma zdalnej kopii, więc `.github/workflows` się nie uruchamiają — to polecenie jest kontrolą przed zakończeniem pracy.
- **Lint** łapie nieznane nazwy (`no-undef`; nazwy Node i przeglądarki wpisane w `eslint.config.mjs`), pomija `scratch/`, `artifacts/` i `screens/`. **Typecheck** obejmuje też `catalog-measures.mjs` i `rejection-rules.mjs`; nowy test nie przejdzie, gdy plik z `// @ts-check` nie jest wymieniony w `tsconfig.typecheck.json`.

## 2026-11-12 (57) — Sprawdzanie ofert, które zniknęły ze skanów: sprawiedliwa kolejność

Aplikacja działa krótko, raz dziennie, a kolejka sprawdzania sortowała należne oferty po cenie malejąco — przy limicie 20 na rundę tanie książki nigdy nie doczekiwały się sprawdzenia, więc nie wiedzieliśmy, czy się sprzedały.

- Progi cenowe (12/24/48 h) nadal tylko decydują, czy oferta jest już **należna**. Kolejność: najpierw nigdy niesprawdzone, potem najdawniej sprawdzone; cena rozstrzyga tylko remis.
- Gdy po rundzie zostają należne oferty z tej kolejki, następna runda rusza po **2 minutach** zamiast 10 (limit 20 na rundę, pauzy po blokadzie źródła i tempo bramki bez zmian). Oferty wciąż widoczne w skanach dalej dostają tylko resztę budżetu.
- Wartości na kopii bazy: należnych **392** (≥100 zł: 256, 40–100 zł: 132, <40 zł: 4), z czego nigdy niesprawdzonych **251** (119 / 132 / 0). W pierwszej rundzie 20 ofert: przed — 3 nigdy niesprawdzone, po — 20. Pierwsza tania (<40 zł) oferta była przed na pozycji 389 w kolejce, teraz na 256; całą zaległość (392) nadrobi ok. 20 rund (~40 min).

## 2026-11-12 (56) — Dziś: cztery miary z trendem

Pod kafelkami „Dziś” są cztery liczby liczone w SQL (`catalog-measures.mjs`, `GET /api/today` → `measures`). Wartości na kopii bazy:

- **Rozpoznane automatycznie: 70,2%** (1796 z 2558 ofert; bez odrzuconych jako „nie książka”). Automatycznie to aktywne przypisanie, którego nie zrobił człowiek (ISBN, metadane, reguła Empiku). Samo rozpoznanie, także ręczne, to 2173 z 2558 = 84,9%.
- **Najstarsza decyzja w kolejce: 1 d** (111 decyzji; od 11.11, 09:54; Empik jako wzbogacanie cen nie liczy się do kolejki).
- **Kompletne wydania: 85,6%** (471 z 550; wydawca i rok, bez „Wydań nieustalonych”) — po uzupełnieniu braków (wpis 54) 89,6%.
- **Dostępność potwierdzona: 10,8%** (288 z 2660) — po wpisie 55 24,8%.

Trend to różnica względem najstarszego zapisu z ostatnich 7 dni. Zapis powstaje raz na dzień i miarę (migracja **132**, `metric_snapshots`), więc przez pierwszy dzień karta pokazuje „trend od jutra”. Strzałka jest zielona, gdy zmiana idzie w dobrą stronę (dla wieku najstarszej decyzji dobra jest zniżka).

## 2026-11-12 (55) — Skaner: Allegro i OLX bez błędów, więcej ofert z potwierdzoną dostępnością

- **Allegro i OLX:** stały stan „brak legalnego dostępu do wyszukiwania ofert” (powody w `docs/SOURCES-ACCESS-2026-11.md`). Są szare, nie czerwone; nie wchodzą do liczników „Źródła 4/5” na „Dziś”, do „źródeł z błędami” ostatniego skanu ani do formularza skanu; skan, harmonogram i szybki skan ich nie pytają (do tej pory każdy skan wysyłał do nich jedno zapytanie, które kończyło się CAPTCHA albo 403).
- **Dedalus.pl** zwraca CAPTCHA (od 11.11, 10:12; 4 oferty w bazie). CAPTCHA nie jest omijana. Bazowy odstęp zapytań wzrósł z 2 s do 6 s, źródło zostaje w stanie „nie działa” z powodem i samo wraca, gdy serwis przestanie blokować. Opis w dokumencie o dostępie do źródeł.
- **Potwierdzona dostępność ofert** (stan inny niż „niepotwierdzona” i „nie było w skanie”), pomiar na kopii bazy, 2660 ofert: **10,8% → 24,8%** (288 → 660).
  - Dlaczego było tak mało: `offer-lifecycle` sprawdzał tylko Vinted i tylko oferty, które zniknęły ze skanów. Oferty wciąż widoczne w wynikach nigdy nie były sprawdzane na własnej stronie, a Empik, Tezeusz i Allegro Lokalnie nie były sprawdzane wcale.
  - Empik i Dedalus podają dostępność w samej liście wyników (`IN_24_H`, `PRE_SALE`, `InStock`): 319 ofert potwierdzone bez żadnego zapytania (10,8% → 22,8%), z datą ostatniego widzenia.
  - Strony produktów Tezeusza (JSON-LD), Empiku (`product:availability`) i Allegro Lokalnie (microdata) są teraz czytane przez bramkę (`readSourceHtml`, bez żadnego nowego toru zapytań): 20 ofert co 10 minut, najdroższe najpierw. Próbny przebieg na kopii: 56 stron, 52 aktywne, 3 sprzedane, 1 usunięta (22,8% → 24,8%); Allegro Lokalnie odpowiedziało CAPTCHA po 13 stronach, więc źródło jest odkładane na pół godziny. Pełne pokrycie to około 15 godzin pracy w tle (1818 ofert niepotwierdzonych, 120 stron na godzinę).
  - Błąd: ta sama oferta mogłaby trafić do jednego przebiegu dwa razy (zniknęła ze skanów i nie była sprawdzana) — zdublowany wpis jest pomijany.

## 2026-11-12 (54) — Katalog: braki wydań uzupełniane ze źródeł

Pomiar na kopii bazy (550 prawdziwych wydań, bez 93 „Wydań nieustalonych”, które z założenia nie mają wydawcy ani roku):

- **Kompletne wydania (wydawca i rok): 471 → 493 z 550, czyli 85,6% → 89,6%.** Bez wydawcy 76 → 57, bez roku 25 → 18. Cel 90% nie jest osiągnięty: pozostałe 57 to głównie starsze książki z Vinted, których nie ma w BN, Open Library ani e-ISBN.
- **Uzupełnianie braków** (`edition-gaps.mjs`, migracja **131**): zwykłe wyszukiwanie ISBN zatrzymuje się na pierwszym źródle, które zna ISBN (np. Open Library bez wydawcy), więc e-ISBN i Google Books (z kluczem) nigdy nie były pytane. Teraz co 10 minut po 6 wydań są pytane wprost, a oprócz tego brane są wydawca i rok ze strony produktu oferty z tym samym ISBN (Tezeusz, Allegro Lokalnie).
  - 78 wydań sprawdzonych, 24 uzupełnione (26 pól): e-ISBN 5 wydawców, strony sklepów 14 wydawców i 4 lata, Google Books 3 lata.
  - Tylko puste pola i nigdy wydanie ręczne (`manual`); wartość ze źródła przechodzi przez tę samą normalizację nazw wydawców, „n/a” i lata spoza 1400–bieżący+1 są odrzucane.
  - Odwracalne: „Uzupełniono dane wydań: N pól…” w „Ostatnich decyzjach” z przyciskiem „Cofnij”; pole zmienione w międzyczasie ręcznie zostaje. Wydanie bez wyniku jest pytane ponownie po 30 dniach, po błędzie sieci po dobie. Wyłączanie: `BOOKFLIP_EDITION_GAPS=0`.
- **Książki → „Braki”:** obok liczników dzieł i wydań są trzy odnośniki: „51 bez wydawcy”, „18 bez roku”, „93 wydanie nieustalone” (+ „89,6% kompletnych wydań”). Kliknięcie filtruje listę po stronie serwera (liczba na liście = liczba w odnośniku), „Pokaż wszystkie” czyści filtr. Pusty panel „Wybierz dzieło” w tej wersji już nie istnieje (lista zajmuje całą szerokość), więc braki są tam, gdzie wcześniej szukało się statusu.
- Lista dzieł pokazuje okładki z `/api/cover` w wariancie miniatury, a inicjały tylko wtedy, gdy obrazek się nie wczyta lub go nie ma — to było już tak (sprawdzone: 0 samych inicjałów w pierwszych 100 dziełach), bez zmian.

## 2026-11-12 (53) — Kolejka: mniej pięter nad listą

- **Układ Weryfikacji:** nad listą były trzy piętra nawigacji (258 px z 900 przy 1440×900, 376 px przy 390×844), teraz jest jeden wiersz zakładek rodzajów i jeden wiersz narzędzi: **160 px** (telefon: 290 px).
  - „Zaznacz wiele”, „Skróty”, „Filtry weryfikacji” i „Ostatnie decyzje” są w jednym menu „Więcej”;
  - zakładki „Wszystkie / Szybkie / Do dodania…” stoją w jednym wierszu z wyszukiwarką i ramką identyfikacji;
  - podpowiedź skrótów z paska zakładek jest tylko w menu („Skróty”).
- **Ramka identyfikacji w stanie bezczynnym** to jedna linia („Zakończono” albo „Zakończono · N błędów”) bez licznika decyzji. Liczba decyzji jest widoczna w dwóch miejscach: na aktywnej zakładce „Weryfikacja” i przy tytule widoku.
- **Tryb wsadowy:** karty są poziome i niższe (222 px zamiast 332 px), przy 1440×900 mieszczą się **dwa pełne rzędy** (było jeden).
- **Duplikaty:** obok „Połącz w jedno” jest „To różne książki”. Decyzja jest odwracalna („Cofnij” w komunikacie i w „Ostatnich decyzjach”, wiersz „Różne książki: A ≠ B”), a grupa przestaje być proponowana — także przez jednorazowe automatyczne łączenie przy starcie. Gdy do grupy dojdzie trzecie dzieło o tym samym kluczu, grupa wraca. Migracja **130** (`distinct_work_pairs`).
- Cele dotykowe poniżej 44 px przy 390 px: 0 (20 zrzutów, oba motywy), bez przepełnienia strony.

## 2026-11-11 (52) — Stanowisko decyzyjne 2: jedna kolejka i mniej decyzji

- **Kolejka** zastępuje w nawigacji „Do weryfikacji” i „Zestawy”. To jeden widok z zakładkami typów; na kopii danych:
  - Weryfikacja — 240;
  - Zestawy (niepotwierdzone) — 139, w tym 92 puste;
  - Podejrzane przypisania — 20;
  - Możliwe duplikaty — 5.
    Dawne ekrany są osadzone bez przepisywania; podejrzane przypisania i duplikaty przeszły z „Narzędzi katalogu” do kolejki. Skróty są wspólne: ↑/↓ (J/K) wybór, Enter akcja, X odrzuć, S pomiń.
- **Tryb wsadowy** w „Szybkie” i „Do dodania”: siatka kart „zdjęcie oferty obok okładki propozycji” (albo danych nowego wydania). Wszystkie karty są zaznaczone; odznaczasz wyjątki i zatwierdzasz resztę jednym Enterem.
  - Każda oferta dostaje własną decyzję w historii.
  - Partia jest zapisana razem (migracja 129). Cofa się ją przyciskiem w powiadomieniu albo „Cofnij całą partię” w „Ostatnich decyzjach”.
  - Na kopii danych siatka „Szybkie” ma 31 z 40 ofert (4 niejednoznaczne zostają do decyzji pojedynczo). „Do dodania” ma 55 ze 113 decyzji z kompletnym formularzem z lubimyczytac.pl.
- Pomiar „Szybkie” (40 ofert, kopia danych):
  - pojedynczo — ok. 4,7 akcji na ofertę (126 akcji na 27 ofert);
  - dawne okno „Zatwierdź pewne…” — 2 kliknięcia i 17 ręcznych zaznaczeń, a lista brała też oferty spoza zakładki;
  - teraz **2 akcje (zakładka, Enter) rozstrzygają 31 ofert**; całą zakładkę zamyka 17 akcji.
  - Okno „Zatwierdź pewne…” zastąpiła siatka.
- **Reguły odrzucania.** „Więcej” → „Odrzuć z regułą…” (klawisz R) odrzuca ofertę. Opcjonalnie zapisuje „odrzucaj takie zawsze”: od tego sprzedawcy, z frazą w tytule (bez różnicy wielkości liter i polskich znaków), droższe albo tańsze niż próg.
  - Reguła od razu odrzuca pasujące oferty z kolejki i działa po każdym przebiegu identyfikacji.
  - Każde jej odrzucenie to osobny wiersz decyzji (`created_by = rejection_rule:<id>`), widoczny i odwracalny w „Ostatnich decyzjach”.
  - Ręczne przypisania i zestawy zawsze wygrywają. Oferty, której odrzucenie cofnięto, reguła już nie rusza.
  - Reguły z liczbą odrzuceń są w Ustawieniach i dają się usunąć. Tabela `rejection_rules`, migracja 129.
- **Zestawy:** „Nie interesuje mnie” (✕ przy wierszu albo X) bez otwierania szczegółów. Zestaw trafia do zakładki „Nie interesują mnie”, skąd „Przywróć” go cofa. Pakiet za 10 000 zł i dwa obcojęzyczne wydania za 2999 zł znikają z góry listy jednym kliknięciem każdy.
- **Błąd (z etapu 0):** wspólna pamięć zapytań przyspieszyła drugie rysowanie szczegółów oferty. Podgląd ISBN z pierwszego rysowania blokował wtedy drugi: „Zatwierdź” był aktywny, a Enter nic nie robił. Szczegóły rysują się teraz raz, po pobraniu oferty, a nieaktualne rysowanie nie zmienia stanu. Wykryte pomiarem kliknięć na kopii danych.
- 677 testów (10 nowych: partie „Szybkie” i „Do dodania” z cofaniem całości, dopasowanie i działanie reguł z pierwszeństwem ręcznych decyzji, „Nie interesuje mnie”, liczniki kolejki, wspólne skróty, treść żądań partii, okno reguły, okablowanie). Testy układu zaktualizowano świadomie: jedna pozycja „Kolejka” zamiast dwóch, nowa pozycja w „Więcej”. Lint, typecheck, format:check i browser-smoke (każdy widok i zakładka kolejki, oba motywy) przechodzą. Zrzuty Kolejki (Szybkie, Do dodania, Zestawy, Podejrzane przypisania, Duplikaty), okna reguły i Ustawień przy 1440×900 i 390×844 w obu motywach: bez poziomego przewijania i celów dotykowych poniżej 44 px.

## 2026-11-11 (51) — Stanowisko decyzyjne 1: ekran „Dziś” i aktualizacje na żywo

- Nowy ekran startowy **Dziś**. Pokazuje:
  - nowe oferty i zmiany cen od ostatniej wizyty (przy pierwszej wizycie w przeglądarce — z ostatniego skanu);
  - decyzje w kolejce;
  - stan źródeł;
  - ostatni i następny skan.
    Każdy kafel otwiera listę z tymi samymi filtrami co licznik. Na kopii danych: 17 nowych w ostatnim skanie, 4 zmiany cen, 240 decyzji (284 oferty), źródła 4/7, następny skan jutro 08:16. Kafel „Nowe oferty” otwiera Oferty z 17 pozycjami i znacznikiem „Nowe w skanie 11.11, 20:10 ✕”. Na dole jest zwinięty „Stan katalogu” (dawniej w Skanerze).
- Stan źródeł bez rozwijania. Niedziałające są na górze i wyróżnione, z datą pierwszej nieudanej próby po ostatnim sukcesie i powodem: „Dedalus.pl — nie działa od dziś 09:30 — serwis żąda CAPTCHA”, „Allegro — nigdy nie zadziałał (próby od 1.11) — CAPTCHA”, „OLX — nigdy nie zadziałał — HTTP 403”. Kliknięcie źródła otwiera jego oferty (`GET /api/source-status`, `source-status.mjs`).
- Formularz skanu to osobny widok **Skan** (w palecie i przycisk „Nowy skan” na ekranie Dziś). Panel „Nowe z ostatniego skanu” powtarzał kartę ostatniego skanu i został usunięty; zastępują go kafle Dziś.
- Oba liczniki czasu w przeglądarce (co 4 s stan katalogu, co 3 s skan) i samoodpytywanie przebiegu skanu (co 1,5 s) zastąpił jeden kanał zdarzeń z serwera (`GET /api/events`, server-sent events). Zdarzenia: zmiana skanu, kolejki i źródła.
  - Serwer sprawdza odciski co 2 s tylko wtedy, gdy ktoś słucha, i wysyła zdarzenie wyłącznie przy zmianie.
  - Bezczynny ekran wysyłał dotąd 15 zapytań na minutę, teraz żadnego.
  - Po zerwaniu połączenia strona łączy się ponownie i pobiera cały stan od nowa.
  - Przycisk „Odśwież” zniknął z nagłówka.
- **Błąd:** licznik „Do weryfikacji” w nawigacji pokazywał 0, dopóki nie otwarto kolejki. Bierze się teraz ze stanu katalogu od pierwszej chwili.
- Start aplikacji (ekran Dziś): **9 zapytań API, 7,7 KB** (przed etapem 0: 19 zapytań, 840 KB; po etapie 0, start na Skanerze: 11 zapytań, 146 KB). Lista skanów (`/api/scan-runs`, 123 KB) wczytuje się dopiero w Skanie, Ofertach i Weryfikacji.
- Rozpoznanie dostępu do Allegro i OLX: `docs/SOURCES-ACCESS-2026-11.md`. Allegro nie udostępnia wyszukiwania ofert w publicznym API (`GET /offers/listing` jest poza publicznym API). OLX Partner API służy do własnych ogłoszeń. Legalnej drogi do skanowania nie ma; nic nie zmieniono w kodzie.
- 667 testów (8 nowych: stan źródeł, podsumowanie Dziś i zgodność licznika z listą, kafle, kanał zdarzeń, odporność na błędną sondę, klient SSE, zamknięcie serwera z otwartym strumieniem, brak liczników czasu). Testy starego układu zaktualizowano świadomie:
  - start na Dziś zamiast na Skanie;
  - siedem widoków;
  - brak podglądu ofert w Skanie;
  - brak „Odśwież” i `setInterval`.
    Lint, typecheck, format:check i browser-smoke (siedem widoków, kontrast w obu motywach) przechodzą. Zrzuty Dziś, Skanu i przefiltrowanych Ofert przy 1440×900 i 390×844 w obu motywach: bez poziomego przewijania, bez celów dotykowych poniżej 44 px.

## 2026-11-11 (50) — Stanowisko decyzyjne 0: lżejsze obrazy i pliki, mniej zapytań, krótszy pasek weryfikacji

- Miniatury (okładki do 56 px) prosi się o mniejszy wariant z serwisu (`/api/image?…&thumb=1`, `/api/cover?…&thumb=1`). Sprawdzone na adresach z kopii bazy: Allegro `original` 2,96 MB → `s180` 12,9 KB, Tezeusz `product_show` ~115 KB → `product_thumb` ~12 KB. Vinted (adres podpisany, inny rozmiar daje 404), Dedalus (inne rozmiary przekierowują na zaślepkę) i Empik (~10 KB) zostają przy oryginale; wariant, który nie istnieje, wraca do oryginału. Pobieranie idzie tą samą drogą i tym samym cache co dotąd. Przejście przez sześć widoków na kopii danych: obrazy **42,0 MB → 5,8 MB**; reszta to zdjęcia Vinted i pełne zdjęcia w szczegółach.
- Pliki aplikacji: gzip i `ETag` z odpowiedzią 304 (`Cache-Control: no-cache` — zmiana pliku jest widoczna po zwykłym odświeżeniu). Start: **683 KB → 205 KB**; ponowne wczytanie strony: **683 KB → 11 KB** (42 odpowiedzi 304).
- Dane widoków wczytują się przy pierwszym wejściu w widok, nie przy starcie; liczniki w nawigacji dalej biorą się ze stanu katalogu. Start na Skanerze: **19 → 11 zapytań API, 840 KB → 146 KB** (bez listy dzieł 485 KB, kolejki, ofert i historii). Narzędzia katalogu pobierają dane po wejściu w Katalog.
- **Błąd:** jedno kliknięcie w weryfikacji wysyłało dwa razy `local-candidates` i `offer-edition`/`proposals` (szczegóły rysują się dwa razy). Teraz raz. Przy wyłączonym trybie handlu nie idą `/api/trading-defaults` ani `/api/offer-scenarios/*` (szuflada oferty, zestaw, Ustawienia).
- Paleta (Ctrl+K) bez trafień proponuje „Skanuj «fraza»”, „Szukaj w ofertach”, „Szukaj w katalogu”, a dla ciągu wyglądającego na ISBN — „Dodaj książkę przez ISBN”.
- Weryfikacja: jedna akcja główna (Zatwierdź albo Utwórz wydanie i przypisz), obok Odrzuć i Pomiń; Zestaw, Dodaj do katalogu, Tryb skupienia i „Ta książka, wydanie nieustalone” są w menu „Więcej”. Pasek ma jeden wiersz zamiast dwóch; skróty (Enter, X, S, Z, N, F) działają jak dotąd. Kliknięcie zdjęcia ogłoszenia powiększa je; gdy wybrana propozycja ma okładkę, zdjęcie i okładka stoją obok siebie w tej samej wysokości.
- Oferty: tytuły zwykłym kolorem tekstu (wiersz i tytuł dalej klikalne, podkreślenie przy najechaniu), „Wymaga decyzji” stonowane — kolor ostrzeżenia zostaje dla błędów i ponowień. Z nagłówka zniknął stały licznik „… ofert · … odrzuconych”.
- 660 testów (16 nowych: miniatury i powrót do oryginału, gzip/ETag/304, paleta, leniwe dane widoków, pasek i menu weryfikacji, zdjęcie). Lint, typecheck, format:check, browser-smoke przechodzą. Zrzuty Weryfikacji, Ofert i Skanera przy 1440×900 i 390×844 w obu motywach: bez poziomego przewijania, bez celów dotykowych poniżej 44 px (`node scripts/ux-shots.mjs`). Pomiary: `node scripts/measure-network.mjs`, wyniki w artifacts/network.

## 2026-11-11 (49) — UX 7: główna akcja pod ręką, jedna nazwa stanu, telefon

- **Błąd:** przy ofercie z ISBN nieznanym źródłom przypięty „Zatwierdź” był wyszarzony, a „Utwórz wydanie i przypisz” leżał poniżej zgięcia przewijanego obszaru (widać 445 z 779 px treści); Enter nic nie robił. Przypięty przycisk przejmuje teraz akcję przypadku — Enter tworzy wydanie z wypełnionego formularza. Gdy zatwierdzić się nie da, pod przyciskami stoi jedno zdanie, czego brakuje.
- Propozycje różniące się wyłącznie numerem ISBN mają to napisane i wyróżniony ISBN; tytuł propozycji zajmuje najwyżej dwa wiersze. Z listy weryfikacji zniknęło powtarzane w każdym wierszu „Wymaga decyzji”, z listy zestawów czerwone „pusty” (92 ze 144 zestawów) — kolor zostaje dla wyjątków.
- Oferty: jedna kolumna „Stan” (W katalogu / Wymaga decyzji / Odrzucona / identyfikacja w toku) zamiast pustej „Identyfikacji”. Ta sama nazwa w tabeli, na telefonie (było „Do sprawdzenia”) i w szufladzie. Ceny wyrównane do prawej. Szuflada: wartości tuż przy etykietach, bez powtórzonej ceny.
- **Błąd:** na telefonie podpis zdjęcia zestawu łamał się w kolumnie 72 px (ramka 72×237 px), a przypięte akcje zajmowały 130 px i zasłaniały skład. Zdjęcie stoi obok tytułu, odnośnik do ogłoszenia jest jeden, akcje nie są przypięte.
- Telefon: Ustawienia są w dolnym pasku (bez okna „Więcej”), przełącznik Lista / Okładki / Serie mieści się w jednym wierszu, profile skanu przewijają się w poziomie, cele dotykowe mają co najmniej 44 px.
- Narzędzia weryfikacji (Skróty, Filtry, Ostatnie decyzje) wyglądają jak sąsiednie przyciski. Ciche przyciski („Szukaj brakujących”, „Zestaw”, „Dodaj do katalogu”…) mają obramowanie. Tytuły ogłoszeń są krojem interfejsu, tytuły katalogowe szeryfem. Ceny dzieła z jednym wariantem nie powtarzają tej samej liczby w trzech tabelach; pusty kafelek sprzedaży Vinted nie jest wyróżniony.
- **Błąd:** „3 zadań z problemami” → „3 zadania z problemami” (odmiana według liczby). Przywrócono polskie znaki we wpisach 38–42 tego pliku.
- 644 testy przeszły (4 nowe: stan przypiętego przycisku, jedna nazwa stanu, wiersze bez powtórzeń, odmiana „zadań”), także lint, typecheck, format:check i browser-smoke z kontrastem w obu motywach. Na kopii danych Enter przy „Bran Mak Morn” utworzył wydanie: 237 → 236 decyzji, 281 → 278 ofert. Brak poziomego przewijania przy 390 px; wszystkie sześć widoków telefonu bez celów dotykowych poniżej 44 px.

## 2026-11-11 (48) — UX 6: czytelność i wspólne narzędzia

- Metadane mają wspólną skalę 13 px zamiast 11–12 px. Nadal widać 6 pozycji weryfikacji, 14 ofert i 9 dzieł przy 1440×900. Nagłówek łączy nazwę i stan; lista weryfikacji zaczyna się teraz na 218 zamiast 250 px.
- Telefon: Odśwież jest ikoną z etykietą dostępności, sześć czytelnych pozycji dolnej nawigacji obejmuje Zestawy. Odnośniki ogłoszeń mają pole co najmniej 44 px. Brak poziomego przewijania strony przy 390 px w obu motywach.
- Neutralny przełącznik polskich wydań; statystyki fraz mają maks. 480 px wysokości i przyklejone nagłówki. Selektory ustawień: 902,2 → 260 px; zwinięta karta zaawansowana: 101,5 → 82 px.
- 640 testów przeszło; test tokenów motywu i browser-smoke z kontrastem również. Każdy punkt ma osobne zrzuty wszystkich sześciu widoków w obu motywach: artifacts/ux-review/stage6-1 do stage6-5. Kontrola ścieżek obejmuje dodatkowo 1920×1080 i 1100×900. Szczegóły: docs/UX-REVIEW-2026-11.md.
- **Błąd:** widoczne przyciski wydań czekały na zakończenie pobierania serii. Obsługa kliknięcia jest teraz gotowa przed pobraniem danych pomocniczych; browser-smoke sprawdza ten przypadek ze sztucznym opóźnieniem.

## 2026-11-11 (47) — UX 5: zwarty katalog i schowane narzędzia

- 1440×900: 9 dzieł zamiast 5; zwykły wiersz 70 zamiast 143 px. Zwarta gęstość zmniejsza odstępy i okładki. Domyślna plakietka „Zweryfikowane” znika z listy; pozostają braki i wyjątki.
- Telefon: początek listy 538 → 330 px. Po wybraniu książki statystyki i narzędzia ustępują szczegółom i powrotowi. Narzędzia są pod jednym przyciskiem z licznikiem podejrzanych przypisań (20); filtry pozostają osobno.
- Zachowano układy Okładki i Serie. 639 testów przeszło. Pomiary i zrzuty: artifacts/ux-review/stage5.

## 2026-11-11 (46) — UX 4: tabela ofert na komputerze

- Przyczyną ukrycia tabeli były dwie bezwarunkowe reguły .offers-table-wrap { display: none }, wymuszające układ kart również na desktopie. Od 901 px wraca istniejąca tabela z sortowaniem w nagłówkach, a karty pozostają na telefonie.
- 1440×900: 14 pełnych ofert zamiast około 7, wiersz 37 zamiast 89 px, 50 zamiast 25 ofert na stronie (50 zamiast 100 stron). Źródło i status są przy wyszukiwaniu. Domyślne stany identyfikacji nie mają ostrzeżeń; szuflada ma mniejszą okładkę i cenę przy tytule.
- browser-smoke klika teraz przycisk oferty w tabeli desktopowej. 639 testów przeszło; pomiary i oba motywy: artifacts/ux-review/stage4.

## 2026-11-11 (45) — UX 3: zestawy w dwóch przewijanych panelach

- 1440×900: wysokość strony 13990 → 900 px; wiersz składu 151 → 58 px; przy 9 książkach widać 7 zamiast 3. Lista i szczegóły przewijają się osobno, wybrana pozycja pozostaje w widoku.
- Zdjęcie przeniesiono do nagłówka, zachowując naturalne proporcje. Skład zajmuje pełną szerokość panelu, ISBN nie łamie się w środku. Mobilny przepływ lista → szczegóły pozostaje.
- 639 testów przeszło, w tym testy zestawów i niezapisanych zmian; zrzuty w obu motywach: artifacts/ux-review/stage3.

## 2026-11-11 (44) — UX 2: wspólna liczba decyzji

- Przed zmianą: 281 ofert w nawigacji, 237 decyzji w nagłówku, 506 zadań w pasku identyfikacji i katalogu. 506 zawierało 225 referencji Empiku; 281 ofert łączy się w 237 decyzji ISBN. To różne zbiory, błędnie opisane tą samą etykietą.
- Wspólne obliczenie kolejki ręcznej daje 237 decyzji / 281 ofert. Nawigacja, katalog, pasek identyfikacji i przycisk skanera pokazują decyzje. Statystyki zadań pozostają w szczegółach, z osobnymi nazwami. Pominięte pozycje nadal są nierozstrzygnięte i należą do globalnego licznika.
- Rozszerzono review-queue-paging.test.mjs o licznik decyzji; review-error-handling.test.mjs sprawdza teraz wspólną kolejkę zamiast starego licznika zadań. Zrzuty: artifacts/ux-review/stage2.

## 2026-11-11 (43) — UX 1: decyzje zawsze pod ręką

- Kopia danych: 2493 oferty. Przy 1440×900 lista zaczyna się na 250 px zamiast 374 px; widać 6 pełnych pozycji zamiast 5. Dolna krawędź głównych akcji: 809 px zamiast 1105 px. Wysokość strony: 900 zamiast 1208 px.
- Telefon 390×844: zatwierdzenie na 677–721 px zamiast 1271–1315 px, nad dolną nawigacją. Zostawiono miejsce pod treścią. Historia i filtry otwierają się nad obszarem roboczym.
- Pomiar i zrzuty w obu motywach: artifacts/ux-review/stage1. Test widoczności wykrył brak jawnego :not([hidden]); poprawiono selektor, zachowując test.

## 2026-11-11 (42) — Mobilna weryfikacja bez ściśniętych kolumn

- **Błąd:** po ukryciu skrótów klawiszowych reguła kontenera zostawiała czterokolumnową kartę propozycji, a tytuł trafiał do 40-pikselowej kolumny. Telefon ma teraz jawnie określone miejsca okładki, tekstu i oceny.
- **Błąd:** cztery akcje dzieliły jeden wąski rząd, łamiąc napisy na pionowe kolumny. Zatwierdzenie i wybór książki bez wydania mają pełne rzędy; odrzucenie i pominięcie są obok siebie. Stopka nie zasłania formularza podczas przewijania.
- Mniejsza fotografia, poziomo przewijane zakładki i pola z tekstem 16 px ograniczają przewijanie i powiększanie formularza na telefonie. Kolory pozostają zgodne z jasnym i ciemnym motywem.
- **Błąd:** zbyt niski kontrast opisu ISBN/proweniencji. Użyto czytelniejszego koloru tekstu pomocniczego.
- Browser smoke obejmuje kartę Durotana na szerokości 390 px w obu motywach: co najmniej 180 px dla tekstu, mniej niż 230 px dla głównych akcji i brak poziomego przepełnienia strony. Dane testowe są izolowane; baza użytkownika nie została zmieniona. Zrzuty wejściowe: screens/IMG_9195–9198.png.

## 2026-11-11 (41) — Opcjonalny autostart Windows (część etapu 4)

- Skrypt windows-autostart.ps1 udostępnia rejestrację i wyrejestrowanie zadania przy logowaniu właściciela oraz odczyt stanu. Serwer startuje bez widocznego okna, z logami w katalogu BookFlip użytkownika. Istniejący serwer jest sprawdzany przed startem.
- Nie zarejestrowano ani nie uruchomiono zadania w systemie. Sprawdzono składnię parserem PowerShell; rzeczywiste logowanie z zadaniem wymaga włączenia opcji przez właściciela. Ekran „Dziś” pozostaje do wykonania.
- Etap sygnału sprzedaży: 639 testów, lint i format:check przeszły.

## 2026-11-11 (40) — Budżet sprawdzeń statusu dla Vinted

- **Błąd:** okresowe sprawdzanie pobierało strony źródeł bez parsera statusu i zapisywało unknown. Budżet 8 sprawdzeń co 10 minut jest teraz przeznaczony na Vinted. Adaptery skanowania wszystkich źródeł pozostają bez zmian; żądania nadal przechodzą przez marketplace-gate.
- Świeża kopia: 739 sprawdzeń, 381 unknown (Empik 210, Allegro Lokalnie 122, Tezeusz 49), 358 rozstrzygniętych Vinted (299 dostępnych, 36 sprzedanych, 23 niedostępne). Rozstrzygnięte: **48,4% historycznie; 100% w historycznym podzbiorze Vinted**. To porównanie doboru próby, nie pomiar nowych żądań po wdrożeniu.
- **Błąd:** nieznany napis w panelu statusu Vinted był uznawany za ukrytą ofertę. Teraz pozostaje nierozstrzygnięty. Niepoprawny identyfikator produktu nie może potwierdzić sprzedaży.
- Raport cyklu rozróżnia nierozpoznaną stronę, blokadę, błąd przekierowania i pozostałe błędy transportu. Historyczna tabela nie przechowuje treści odpowiedzi; nie przypisujemy jej wstecz nieudokumentowanych przyczyn.
- Rozpoznanie etapu 2: 100 oczekujących ofert Vinted z nieznanym ISBN; 0 ręcznych decyzji Vinted jednoznacznie opisanych jako utworzenie wydania z ogłoszenia. Brak podstaw do potwierdzenia progu 98%, więc automat Vinted pozostaje niewłączony. Istniejący offer-editions.mjs już udostępnia wypełniony formularz z możliwością zatwierdzenia.

## 2026-11-11 (39) — Odwracalne przypisania Empiku do dzieła

- Pewne propozycje Empiku bez ISBN przypisujemy do dzieła przez wydanie „nieustalone”, nigdy do zgadywanego konkretnego wydania. Każda decyzja ma znacznik auto_empik_work_v1 i jest widoczna w „Ostatnich decyzjach”. Cofnięcie blokuje ponowne automatyczne przypisanie.
- Automat pomija wcześniejsze decyzje, aktywne przypisania, zestawy i tytuły rozpoznane jako zestawy. Uruchamia się po przebiegu identyfikacji.
- Świeża kopia bazy z 11.11: **94 przypisania**. Baza użytkownika nie była modyfikowana. Odczyt ISBN z dodatkowego API Empiku nadal nie jest wdrożony.

## 2026-11-11 (38) — Empik poza główną kolejką (część etapu 1)

- **Błąd:** ceny odniesienia Empiku zajmowały główną kolejkę identyfikacji. Oferty Empiku mają teraz osobną zakładkę „Empik — ceny odniesienia”; nie zwiększają licznika menu ani zakładki „Wszystkie”. Pozostają dostępne do ręcznego przeglądu. Sam podział nie zmienia przypisań i nie tworzy decyzji.
- Pomiar na kopii SQLite z 11.11: 506 zadań przed zmianą, 281 w głównej kolejce po zmianie (239 wierszy po grupowaniu ISBN); Empik w głównej kolejce **225 → 0**, wszystkie 225 w zakładce odniesienia. Katalog: 2588 ofert, 379 dzieł, 506 wydań.
- Pojedynczy odczyt strony produktu Empiku przez readSourceHtml nie dostarczył ISBN do istniejącego parsera. Nie wdrożono jeszcze odczytu dodatkowego API ani automatycznych przypisań. Pozostałe etapy zadania pozostają otwarte.
- Kontrole: 636 testów, lint, format:check i browser-smoke przeszły. Test regresji sprawdza zachowanie ofert w oddzielnej zakładce i licznik głównej kolejki.

## 2026-11-11 (37) — Skaner i czytelność

- **„Skuteczność fraz i profili skanu” na ekranie Skanera** — wiersz pod „Stanem katalogu”, rozwijany jak on. Była ukryta w Weryfikacji pod „Ponawianie i szczegóły wyników” (zmiana 31 błędnie podawała Ustawienia). Nowy opis mówi, do czego służy: które frazy i profile przynoszą książki warte uwagi — oferty, w katalogu, czeka na decyzję, bez ISBN, sprzedane w 14 dni, mediana sprzedanych, ponad 50 zł — i że porównanie profili rozstrzyga, czy zostać przy niszy. **Błąd:** lista fraz profilu w tej tabeli nie zawijała się i nachodziła na liczby.
- **Allegro i OLX pod „Niedostępne (2): Allegro, OLX”** zamiast obok działających źródeł. Na kopii danych z 2026-11-10 oba nigdy nie zadziałały (CAPTCHA, HTTP 403). Po rozwinięciu można je dalej zaznaczyć; dotyczy to każdego źródła, które nie działało w ostatnim skanie, i samo wraca, gdy źródło znów działa.
- **„14 zadań z problemami — wyniki mogą być niepełne” rozwija listę tych zadań:** dla każdego źródła powód i frazy, osobno frazy pominięte po blokadzie bez zapytania. Jeśli są chwilowe błędy, obok jest „Ponów chwilowe błędy (N)”; jeśli nie — wprost, że to blokady i ponowienie nic nie da. W ostatnim skanie wszystkie 14 to Allegro (CAPTCHA) i OLX (403): po 1 próbie i 6 pominiętych fraz na źródło, nic do ponowienia.
- **Daty w wierszach ofert:** „dziś 20:53”, „wczoraj”, „8.11” (z innego roku „8.11.2025”) zamiast „10.11.2026, 20:53:55”; pełna data jest w podpowiedzi. Lista i tabela Ofert oraz „Nowe z ostatniego skanu”.
- **Jeden nagłówek na widok.** Pod paskiem z nazwą widoku był drugi nagłówek: nadtytuł, ta sama nazwa i opis (ok. 150 px). Został pasek; z drugiego wiersza tylko przycisk albo licznik („Dodaj książkę”, „498 ofert w 457 decyzjach”, stan skanu). W Katalogu „Dodaj książkę” jest na końcu wiersza z liczbą dzieł.
- **Katalog:** lista dzieł przykleja się pod paskiem na pełną wysokość okna (było 100% − 230 px przy szczegółach wysokich na kilka tysięcy pikseli). **Błąd:** zdjęcie wydania na liście wydań w szczegółach dzieła rozciągało się do 286×429 px (na telefonie 121×182) — teraz miniatura 40×60. „Seria i tom” i „Uniwersum w widoku Serie” to po jednym wierszu z bieżącą wartością („Seria i tom: brak”, „Uniwersum: Forgotten Realms (automatycznie)”); formularz otwiera „Edytuj”.
- **Zestawy domyślnie od najdroższych** (na kopii danych: 142 zestawy, pierwszy za 10 000 zł); „Ostatnio zmienione” — dotychczasowa kolejność — do wyboru obok wyszukiwarki.

## 2026-11-11 (36) — Szybszy start

- **Start aplikacji: ok. 1,7 s → 1,0 s.** Mierzone na kopii danych z 2026-11-10 w przeglądarce (5 uruchomień, dwie serie, ten sam plik danych dla starej i nowej wersji): do chwili, gdy przestają iść zapytania, 1,62–1,80 s przed i 0,96–1,03 s po; ostatnia odpowiedź 2,5–2,8 s przed i 0,97–1,02 s po. Zapytań 80 → 73 (do API 39 → 32).
- **Skąd to czekanie.** Każde zapytanie osobno jest szybkie (1–76 ms; tylko „stan katalogu” 300 ms), ale przy starcie trywialny `/api/scan/status` (6 ms) czekał 970 ms. Serwer obsługuje zapytania po kolei — odczyt SQLite jest synchroniczny i zajmuje jedyny wątek — więc czas startu to suma pracy wszystkich zapytań (ok. 1,5 s), a nie najwolniejsze z nich. Dlatego pomaga tylko mniej pracy, nie więcej równoległości.
- **Usunięte powtórzenia:** „stan katalogu” (`/api/catalog/insights`, 300 ms) był liczony 3 razy — przy wczytaniu panelu, przy otwarciu Skanera i po odczycie statusu; teraz raz (drugie wywołanie w trakcie czeka na pierwsze, a kolejne w ciągu 3 s jest pomijane, chyba że to odświeżenie po uzupełnieniu zdjęć). Lista „Nowe z ostatniego skanu” była pobierana 3 razy, z czego 2 odpowiedzi szły do kosza, bo jeszcze nie było wiadomo, który skan jest ostatni; teraz raz, po wczytaniu przebiegów skanu. Profile skanu były pobierane osobno dla listy profili i dla „Automatyczny skan”; teraz harmonogram dostaje listę od profili. Zniknęły przez to też 2 z 3 zapytań o uzupełnianie zdjęć.
- **Do decyzji (bez zmian):** przy starcie przeglądarka i tak pobiera ok. 13 MB, prawie wyłącznie zdjęcia Allegro Lokalnie w pełnym rozmiarze (adresy `…/original/…`, po 0,1–3 MB) jako miniatury na liście nowych ofert. Pomniejszona wersja z CDN Allegro skróciłaby to kilkukrotnie, ale oznacza nowe pobrania z Allegro dla każdej oferty, więc tego nie zmieniałem.

## 2026-11-11 (35) — Kolory tylko w zmiennych; test kontrastu w obu motywach

- **Motyw ciemny to wyłącznie inne wartości zmiennych.** W `app/app.css` było 239 deklaracji z kolorem wpisanym wprost (125 różnych kolorów) przy 46 zmiennych, a motyw ciemny łatał to osobną regułą „stare białe tła” — każde nowe miejsce z białym tłem psuło się w trybie ciemnym (zmiana 33). Teraz żadna reguła nie wpisuje koloru: wszystkie kolory są zmiennymi (103), a bloki motywu ciemnego ustawiają tylko ich wartości. Zmienne, które nie mają wartości ciemnej, są takie same w obu motywach: tekst na zielonych przyciskach, ciemnozielony pasek boczny, kolory źródeł, zaślepki okładek, przyciemnienie pod oknami. Usunięte zostały też dwa martwe zestawy zmiennych z dawnych warstw (ich wartości i tak nadpisywał zestaw v5).
- **Motyw jasny bez zmian** — sprawdzone na kopii danych w 34 stanach (wszystkie widoki, rozwinięte panele, szczegóły dzieła, wydania, oferty, zestawu, zakładki weryfikacji, paleta poleceń, okno „Dodaj książkę”) przy szerokości 1440, 1000 i 390 px: obliczone kolory 135 761 elementów i pseudoelementów są identyczne przed i po; zrzuty ekranu różnią się tylko godziną w treści i wygładzaniem tekstu. Literały, które przy tym miały po kilka niemal identycznych odcieni (np. sześć teł po najechaniu od `#f2f6f3` do `#f7faf8`), dzielą jedną zmienną — wszystkie takie reguły były w tych stanach nadpisane przez późniejsze.
- W motywie ciemnym zmieniły się świadomie: cienie (szuflada oferty, dolny pasek na telefonie, okienko „Skróty”) są ciemne zamiast zielonkawych, a nagłówek listy dzieł i „Filtry…” w Katalogu mają szary kolor pomocniczy jak w motywie jasnym.
- **Błąd:** nagłówki tabeli źródeł w Skanerze („Źródło”, „Oferty”, „ISBN”…) miały w motywie jasnym kontrast 2,65:1; teraz 4,6:1. To jedyna zmiana wyglądu motywu jasnego, wyłapana przez nowy test poniżej.
- **Ochrona przed regresją.** `scripts/browser-smoke.mjs` przechodzi przez wszystkie widoki w obu motywach, na komputerze i telefonie, z rozwiniętymi panelami, i zgłasza każdy tekst, którego kontrast do faktycznego tła (z przezroczystościami) jest poniżej 3:1 — na arkuszu sprzed zmiany 33 zgłasza „Skróty” w weryfikacji (2,49:1). Szybki test `theme-tokens.test.mjs` (w `npm test`) pilnuje, żeby żadna reguła nie wpisywała koloru i żeby motyw ciemny zmieniał tylko zmienne.

## 2026-11-11 (34) — Weryfikacja: pomiar pewnych propozycji, „wydanie nieustalone” jednym klawiszem, lista stronicowana

- **Pomiar: czy „pewna propozycja” może zatwierdzać się sama — nie.** Na kopii danych z 2026-11-10 policzone z `review_decisions` i `title_proposals` (propozycja zapisana przed decyzją): 92 ręczne decyzje dotyczyły ofert z pewną propozycją. Wszystkie 92 to zatwierdzenia **tej samej książki** (0 odrzuceń, 0 innych książek), ale tylko **59 (64%) zatwierdzało dokładnie proponowane wydanie (ISBN)**. W 33 przypadkach wybrane było inne wydanie tej książki: 16 razy inne wydanie z katalogu (np. „Fulgrim: wizje zdrady” 2013 zamiast proponowanego 2021, „Kolor magii” 2010 zamiast 2008), 17 razy „wydanie nieustalone”. Przy propozycjach o wyniku ≥ 95% jest tak samo: 52 z 80 (65%). Próg 98% nie jest spełniony, więc **automatyczne zatwierdzanie nie zostało włączone**. Co by pomogło: (1) automat na poziomie książki zamiast wydania — „ta książka, wydanie nieustalone” zgadzałoby się z decyzją w 92 na 92 przypadkach (100% przy tak małej próbie; warto poczekać na ok. 300 decyzji); (2) wybór wydania z ogłoszenia (rok, wydawca, oprawa w tytule) przed porównaniem z propozycją BN — dziś propozycja to najczęściej najnowsze wydanie z BN, a ogłoszenie dotyczy starszego; (3) zapisywanie w `review_decisions`, jaka propozycja była pokazana — dziś trzeba to odtwarzać z `title_proposals`, a przeliczona propozycja nadpisuje poprzednią.
- **„Ta książka, wydanie nieustalone” jednym klawiszem: N** (przycisk obok „Zatwierdź”, opis w „Skróty”). Na przykład „Sojusznicy”: propozycje 2015 i 2011 różnią się tylko rokiem — N przypisuje ofertę do książki bez wybierania wydania. Działa na propozycji wybranej klawiszem 1–9 (albo wstępnie zaznaczonej); bez wyboru tylko wtedy, gdy wszystkie propozycje mają ten sam tytuł — inaczej pierwsza propozycja bywa inną książką cyklu („Zabójca Ghuli” przy ofercie „Zabójca Trolli”), więc N tylko o tym informuje. Propozycja z BN, której książki nie ma jeszcze w katalogu, jest najpierw dodawana do katalogu po ISBN (jak „Dodaj książkę”). Mechanizm wydania nieustalonego jest ten sam co w zmianie 25: gdy ogłoszenie wskazuje wydanie (rok, wydawca, oprawa), oferta trafia do niego i komunikat o tym mówi. Jedna decyzja w „Ostatnich decyzjach”, do cofnięcia jak każda.
- **Panel „Automatyczna identyfikacja” w spoczynku to jedna linia** (46 px zamiast ok. 100): tytuł, stan („Zakończono · 498 do decyzji · 0 błędów”), mały przycisk „Uruchom ponownie” i „Szczegóły i ponawianie”, które rozwija pełny panel pod linią. Na telefonie dwie linie. W trakcie identyfikacji panel jest pełny jak dotąd.
- **Lista weryfikacji stronicowana na serwerze.** Wcześniej przy wejściu pobierana była cała kolejka (500 pozycji w dwóch zapytaniach, 613 kB), a pokazywane 100; na telefonie lista miała ok. 10 400 px. Teraz jedno zapytanie po 50 decyzji (65 kB na kopii danych), kolejne strony przyciskiem „Pokaż kolejne · widać 50 z 457” na końcu listy, przewinięciem albo klawiszem ↓ z ostatniej pozycji (↑ wraca). Na telefonie lista ma 4 900 px. Serwer scala oferty z tym samym ISBN w jedną decyzję (×N), liczy rozmiary grup według frazy w całej przefiltrowanej kolejce i układa grupę jak dotąd: najpierw „jest w katalogu”, potem pewne, możliwe i słabe propozycje. Po decyzji odświeżany jest ten sam zakres, więc następna oferta jest ta pod rozstrzygniętą.
- **„Pominięte” (klawisz S) są zapisane w bazie** zamiast w przeglądarce — inaczej nie dałoby się ich pominąć na serwerze; przy okazji widać je też na telefonie. Lista pominiętych z przeglądarki przenosi się sama przy pierwszym wejściu. Liczniki zakładek też je pomijają.
- **Błąd:** w szczegółach oferty „1 z 50” liczyło tylko wczytane pozycje; teraz „1 z 457”.

## 2026-11-11 (33) — Poprawki po przeglądzie: motyw ciemny, liczniki, okładki

- **Błąd:** w motywie ciemnym część elementów miała białe tło i jasny tekst. Sprawdzone skryptem, który w każdym widoku (także z rozwiniętymi panelami, szczegółami książki, oferty i zestawu, na szerokości komputera i telefonu) mierzy kontrast tekstu do faktycznego tła: 22 miejsca z kontrastem poniżej 3:1, wszystkie poprawione. Były to: kafelek cen książki w Katalogu (ceny niemal niewidoczne, kontrast 1,1:1), przyciski narzędzi Katalogu („Możliwe duplikaty dzieł”, „Podejrzane przypisania”, „Wydawcy i serie” — z całą zawartością, „Zasilanie katalogu…”, „Filtry…”), przycisk „Skróty” i jego okienko w weryfikacji, znacznik „×4” (oferty z tym samym ISBN) w liście weryfikacji, panel „Dodaj z opisu ogłoszenia albo zakres tomów” w Zestawach. Kolory tych elementów są teraz zmiennymi z wartością jasną identyczną jak dotąd — motyw jasny wygląda tak samo.
- **Błąd:** pod listą w Katalogu były dwa nieostylowane przyciski („Pokaż kolejne (wczytano 250 z 361)” i „Pokaż kolejne wczytane (100 z 250)”). Jest jeden, na końcu listy, wyglądający jak pozostałe przyciski: „Pokaż kolejne · widać 100 z 361”. Dokłada 100 dzieł, a gdy wczytane się skończą, sam pobiera kolejną stronę.
- **Błąd:** w Ofertach po przejściu z „Wg książki” na „Lista” nagłówek zostawał na „487 wydań”; teraz pokazuje „2457 pasujących ofert”.
- **Jedna liczba ofert.** Pasek górny pokazywał 2556 ofert (wszystkie w bazie, z odrzuconymi), menu 2457 (bez odrzuconych, ale liczone z listy Ofert z jej bieżącymi filtrami, więc po filtrowaniu zmieniało się w menu). Teraz oba pokazują oferty bez odrzuconych, liczone w bazie niezależnie od filtrów: pasek „2457 ofert · 99 odrzuconych”, menu „2457 zapisanych”, z rozbiciem w podpowiedzi. W weryfikacji „498 ofert · 457 decyzji” → „498 ofert w 457 decyzjach”: oferty z tym samym ISBN rozstrzyga jedna decyzja (znacznik „×N” przy ofercie).
- **Błąd:** okładki z Open Library dawały 404 w konsoli, a propozycje w weryfikacji pokazywały zaślepkę z literą. Przyczyna: Open Library nie ma okładek tych polskich wydań (sprawdzone wprost, np. 9788324156887, 9788324141432, 837418034X — 404). Nowa trasa `/api/cover?isbn=…`: najpierw zdjęcie zapisanej oferty tej książki (przypisanej do wydania z tym ISBN, sklepy przed serwisami ogłoszeniowymi, a potem dowolnej oferty, w której ogłoszeniu był ten ISBN), dopiero potem Open Library; gdy nic nie ma, przezroczysty obrazek zamiast błędu, a strona pokazuje zaślepkę. Na kopii danych z 2026-11-10: z 15 dzieł w Katalogu, które nie mają przypisanej oferty ze zdjęciem (dotąd tylko Open Library), 13 dostaje zdjęcie z ogłoszenia z tym ISBN; w kolejce weryfikacji 139 ze 142 ofert z ISBN ma zdjęcie oferty tej samej książki.

## 2026-11-10 (32) — Porządki techniczne

- **Kolejka weryfikacji: „Najdroższe najpierw”** — nowe sortowanie po cenie oferty malejąco (drogie oferty są najważniejsze przy odsprzedaży); przy obu sortowaniach po cenie oferty bez ceny są na końcu (wcześniej na początku).
- **Tabela tras.** Serwer ma jedną tabelę tras (63 trasy) zamiast łańcucha warunków, a trasy z `trading-api.mjs` — własną tabelę zamiast wyrażenia regularnego, które trzeba było uzupełniać przy każdej nowej ścieżce. Parametry ścieżki (`/api/sets/:offerId/editions/:editionId`) są dekodowane w jednym miejscu — ręczne dzielenie ścieżki spowodowało kiedyś błąd tras zestawów (zmiana 20).
- **Naprawy danych przy starcie raz, nie przy każdym uruchomieniu.** Cofnięcie błędnych odrzuceń z 8.11, odrzucanie kopii odrzuconych ofert, odrzucanie obcojęzycznych wydań i ujednolicanie wydawców wykonują się teraz jednorazowo (flaga w bazie; ujednolicanie wydawców jeszcze raz, gdy zmienią się reguły pisowni). Dalej robią to: zapis nowej oferty, decyzja „odrzuć” (kopie tej oferty czekające w weryfikacji są odrzucane od razu, a nie przy następnym starcie), każde przejście identyfikacji i włączenie „Tylko polskie wydania”. Przy każdym starcie zostały tylko: wczytanie uniwersów i wariantów nazw do pamięci oraz zastosowanie połączeń nazw serii (serie zapisują BN i ogłoszenia bez tej listy). Cykl i tom z tytułów ogłoszeń liczy już tylko zadanie co 10 minut. Na kopii danych z 2026-11-10 żadna z przeniesionych napraw nic nie zmieniła (0 zmian), a kolejne uruchomienie trwa 48 ms zamiast 120 ms.
- **Szybsze rozpoznawanie dzieła (migracja 128).** Klucz dzieła (tytuł główny + nazwisko autora, tytuł oryginalny) jest w indeksowanej tabeli; zmienione dzieła są przeliczane same (wyzwalacze), a po zmianie uniwersów — wszystkie. 300 wyszukań: 75 ms zamiast 1387 ms, z tym samym wynikiem.
- **Frazy ofert jako tabela (migracja 127)** zamiast przeszukiwania JSON w każdym zapytaniu: oznaczanie ofert, których pełny skan nie zwrócił, i statystyki fraz.
- **Jeden kształt oferty przy zapisie skanu** (`offer-ingest.mjs`, typ JSDoc `ScannedOffer`): title, price, image, isbn — bez równoległych nazw. Sprawdzanie typów bez budowania: `npm run typecheck` (TypeScript tylko jako narzędzie deweloperskie) dla ścieżki oferty i repozytorium.

## 2026-11-10 (31) — Pomiar nisz

- **Ustawienia → „Skuteczność zapytań i nisz”** ma tabelę profili skanu obok siebie: liczba ofert, mediana dostępnych, **odsetek sprzedanych w 14 dni**, **mediana ceny sprzedanych**, **liczba ofert powyżej 50 zł**. Te same trzy kolumny są przy każdej frazie i źródle. Ma to rozstrzygnąć po kilku tygodniach, czy zostać przy niszy, czy poszerzać zakres — wystarczy zapisać drugi profil (np. „Kryminał PRL”) i skanować oba.
- „Sprzedane w 14 dni” to oferty, których strona pokazała „Sprzedane” najpóźniej 14 dni po pierwszym wykryciu. Liczone tylko wśród ofert widzianych po raz pierwszy co najmniej 14 dni temu, żeby nowa fraza nie wypadała gorzej tylko dlatego, że jest nowa. Mediana w SQL, w groszach.
- Na danych z 2026-11-10: „Uniwersa” — 1209 ofert, mediana dostępnych 40 zł, 10 sprzedanych (mediana 104,50 zł), 491 powyżej 50 zł; „Autorzy i cykle” — 819 ofert, mediana 35 zł, 0 sprzedanych, 273 powyżej 50 zł. Odsetek sprzedanych w 14 dni pokaże się od ok. 15.11 — wszystkie oferty w bazie są młodsze niż 14 dni.

## 2026-11-10 (30) — Uniwersa w danych zamiast w kodzie

- **Uniwersa do edycji (migracja 126).** Katalog → „Wydawcy i serie” ma sekcję „Uniwersa”: nazwa, inne zapisy (np. „Discworld; Discworld series”), serie wydawnicze związane z uniwersum („Black Library; Czarna Biblioteka”) oraz cykle i postacie, które je wskazują („Herezja Horusa; Drizzt”). Można dodać uniwersum (np. „Wiedźmin; The Witcher”), poprawić je, zmienić mu nazwę albo je usunąć; jeden zapis może należeć tylko do jednego uniwersum. Zmiana obowiązuje od razu dla tytułów czytanych od teraz.
- Wcześniej nazwy uniwersów były wpisane osobno w 9 modułach, każdy z trochę inną listą. Teraz wszystkie listy powstają z jednej tabeli: usuwanie nazwy uniwersum z tytułu („World of Warcraft: Illidan” = „Illidan”), odróżnianie uniwersum od cyklu w serii z BN, uniwersum w widoku Serie, słowa pomijane przy porównywaniu tytułów i odrzuconych ofert, poszerzanie wyszukiwania („Świat Dysku” znajduje też „Discworld”). Dane początkowe to obecne wartości z kodu, połączone: Świat Dysku, Warcraft, Warhammer, Dragonlance, Forgotten Realms oraz Diablo, StarCraft i Star Wars (dotąd tylko na części list).
- Na danych z 2026-11-10 różnica względem dotychczasowych list: 19 z 2741 tytułów ma inny tytuł główny (np. „Diablo: Wojna grzechu…” → „Wojna grzechu…”, „Star Wars: Mroczny uczeń…” → „Mroczny uczeń…”, „Warhammer Age of Sigmar: Malign sorcery” → „Malign sorcery”), 49 tytułów dostało uniwersum w widoku Serie (głównie Diablo, Star Wars i „Zapomniane Krainy” → Forgotten Realms), a serie „Diablo” i „Star Wars” z BN są uniwersami zamiast cyklami. Istniejące dzieła nie są przy tym automatycznie łączone.

## 2026-11-10 (29) — Szybki skan najnowszych ofert

- **Drugi tryb skanu.** W „Automatyczny skan” jest nowa sekcja „Szybki skan najnowszych ofert” z własnym odstępem (1–24 h, domyślnie co 2 h), **domyślnie wyłączona**. Czyta jedną stronę wyników na frazę, posortowaną od najnowszych, tylko w źródłach, które pozwalają tak sortować — sprawdzone na żywej stronie: Vinted (`order=newest_first`; ok. 90 ogłoszeń na stronie). Używa tego samego profilu co pełny skan; gdy oba są do wykonania, pierwszeństwo ma pełny.
- **Nie oznacza ofert jako zniknięte** — nawet gdy fraza ma tylko jedną stronę wyników. Robi to wyłącznie pełny skan, który pozostaje bez zmian.
- Nowe oferty z szybkiego skanu są widoczne w pasku „Od ostatniej wizyty” jak każde nowe oferty (liczone po dacie pierwszego wykrycia).

## 2026-11-10 (28) — Ceny porównują porównywalne

- **Rodzaj oferty.** Każda oferta ma rodzaj wynikający ze źródła: nowa w sklepie (Empik, Dedalus, sklepy z Empik Marketplace), antykwariat (Tezeusz, antykwariaty sprzedające przez Empik), prywatny egzemplarz (Vinted, OLX, Allegro Lokalnie). Reguły są w jednym miejscu i działają tak samo w kodzie i w zapytaniach SQL. Na danych z 2026-11-10: 1936 prywatnych, 365 ze sklepów, 77 z antykwariatów. Oferty z Empiku zapisane przed zmianą 26 nie mają nazwy sprzedawcy, więc do najbliższego skanu liczą się jako sklepowe.
- **Ceny książki osobno dla każdego rodzaju i stanu.** Na stronie książki w Katalogu pierwszy kafelek to **„Sprzedane na Vinted”** (mediana, liczba sprzedaży, zakres) — cena odsprzedaży. Obok mediany dostępnych ofert osobno dla nowych w sklepie, antykwariatów i prywatnych egzemplarzy, a w tabeli także wg stanu egzemplarza (nowa / bardzo dobra / dobra / zadowalająca / nieznany). Wcześniej jedna mediana mieszała nową książkę z Empiku z używanym egzemplarzem z Vinted: na danych z 2026-11-10 67 książek ma dostępne oferty więcej niż jednego rodzaju, a w 22 z nich wspólna mediana różniła się od mediany prywatnych egzemplarzy o ponad 20%.
- **Statystyki cen liczone w SQL**, w groszach (mediana, najniższa, najwyższa, sprzedane). Zapis skanu nie ocenia już cen modułem historii (`price-analysis.mjs`) — skan zwraca zapisane oferty jednym zapytaniem. Model historii zostaje tylko dla eksportu „Historia ofert” i dawnych odpowiedzi API.

## 2026-11-10 (27) — Wiarygodny sygnał sprzedaży na Vinted

- **Historia stanów oferty (migracja 125).** Każdy zaobserwowany stan jest zapisywany z datą: pierwsze i ponowne pojawienie się w skanie, brak w pełnym skanie frazy, każde sprawdzenie strony ogłoszenia (dostępna / zarezerwowana / sprzedana / usunięta / nieczytelna). Dzięki temu sprzedaż ma przedział: „między ostatnim widzeniem a sprawdzeniem”. W szczegółach oferty sprzedanej: „Sprzedana między 3.11 a 5.11” oraz rozwijana „Historia stanów”. Z wcześniejszych danych odtworzone: 2378 pierwszych wykryć i 23 zmiany znalezione przy sprawdzaniu (10 sprzedanych, 11 usuniętych, 2 dostępne).
- **Drogie oferty sprawdzane wcześniej i częściej.** Oferta, której skan już nie zwraca, jest sprawdzana:
  - od 100 zł — po 12 h nieobecności, potem co 24 h;
  - 40–99,99 zł — po 24 h, potem co 48 h;
  - poniżej 40 zł — po 48 h, potem co 96 h (wcześniej wszystkie: po 2 dniach, co 3 dni).

  W kolejce najpierw najdroższe. Tempo bez zmian: 8 stron na 10 minut, przez wspólną bramkę źródła. Na danych z 2026-11-10 do sprawdzenia czeka 1902 ofert (wg starej reguły 1505), w tym 463 od 100 zł — te zostaną sprawdzone w pierwszych ok. 10 godzinach.

- **Ponowne wystawienia.** Nowa oferta tego samego sprzedawcy o tym samym tytule albo ISBN, która pojawia się po zniknięciu poprzedniej (brak w pełnym skanie albo strona usunięta), jest z nią powiązana. W szczegółach obu ofert widać „Wcześniej wystawiona jako… / Wystawiona ponownie jako…” z przyciskiem „To różne ogłoszenia”. Powiązanie jest w „Ostatnich decyzjach” jako „Ponowne wystawienie (automatycznie)” i można je tam rozłączyć; rozłączona para nie jest łączona ponownie. Nic nie jest przez nie odrzucane — oferta przechodzi identyfikację jak każda inna. Działa od teraz: sprzedawca jest zapisywany od zmiany 26, więc starszych ofert (360 ofert Vinted w 95 grupach o identycznym tytule) nie da się powiązać wstecz.

## 2026-11-10 (26) — Pełny zapis obserwacji oferty

- **Stan egzemplarza (migracja 124).** Każda oferta ma teraz zapisany stan tak, jak podało go źródło („Bardzo dobry”, „Nowy z metką”, „Ze śladami użytkowania”), i jego klasę: nowa / bardzo dobra / dobra / zadowalająca / nieznana. Vinted podaje stan na liście wyników, więc ma go każda nowa oferta; dla ofert Allegro Lokalnie i Tezeusza stan jest raz przepisany z odczytanych wcześniej stron ogłoszeń. Na danych z 2026-11-10: 329 ofert dostało stan (bardzo dobra 161, dobra 69, nowa 24, nieznana 75 — „Używana”, „Produkt kolekcjonerski”).
- **Opłata kupującego, sprzedawca, polubienia (Vinted).** Zapisywane z listy wyników: opłata za ochronę kupującego (np. 4,45 zł przy cenie 31,07 zł), identyfikator sprzedawcy i to, czy jest firmą, liczba polubień (aktualizowana przy każdym skanie).
- **Opis, liczba zdjęć i data wystawienia (Vinted) bez dodatkowych zapytań.** Skan i tak otwiera stronę każdej nowej oferty Vinted, żeby sprawdzić język. Teraz zapisuje z niej też opis, liczbę zdjęć, stan i wiek ogłoszenia („Dodane 3 godz.” → przybliżona data wystawienia). Opis trafia do opisów ogłoszeń, więc oferta oznaczona później jako zestaw nie jest pobierana drugi raz.
- **Empik: prawdziwa dostępność i sprzedawca.** Wcześniej każda oferta z Empiku była „dostępna”. Teraz liczy się stan z kafelka (wysyłka w 24 h, przedsprzedaż); niedostępny produkt nie jest zapisywany jako oferta. Zapisywany jest też sprzedawca: Empik albo sklep z Empik Marketplace (np. antykwariat) — przyda się do rozróżnienia nowych książek od używanych.
- **Surowe dane ogłoszenia.** Przy pierwszym zapisie i przy każdej zmianie (polubienia i wiek ogłoszenia się nie liczą) zapisywany jest obiekt oferty z listy wyników i ze strony ogłoszenia, do 16 KB — żeby po zniknięciu ogłoszenia dało się odczytać pola, których dziś nie przewidujemy.
- **Pominięte przed zapisem.** Panel „Przebieg skanu” pokazuje, ile ogłoszeń skan odrzucił i dlaczego: obcy język, brak podanego języka (Vinted), spoza tematu frazy, nie-książki. Liczby zapisują się w podsumowaniu skanu. Na przykładowej stronie Vinted „pratchett”: 66 zapisanych, 23 spoza tematu, 3 w obcym języku.
- **Szczegóły oferty** pokazują stan, opłatę kupującego, sprzedawcę, liczbę zdjęć, datę wystawienia, polubienia i dostępność w sklepie — tylko to, co źródło podało.
- **Czego źródła nie podają:** Vinted nie umieszcza na stronie kosztu dostawy (przeglądarka pobiera go osobno po załadowaniu strony) ani liczby wyświetleń; daty wystawienia nie podaje wprost, tylko „Dodane 3 godz.”. OLX i Allegro Lokalnie na liście wyników nie podają sprzedawcy.

## Starsze wpisy

Wpisy do 2026-11-09 włącznie: [docs/archive/CHANGELOG-do-2026-11-09.md](docs/archive/CHANGELOG-do-2026-11-09.md).
