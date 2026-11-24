# Kierunek produktu BookFlip — handel książkami, nie kolekcjonerstwo

> **2026-11-21:** właściciel dał zespołowi wolną rękę w zmienianiu projektu, także tego kierunku (funkcja „Etykiety” zostaje). Zmiany kierunku zapisujemy tutaj i w `CLAUDE.md`.

## Decyzja produktowa

**BookFlip to narzędzie do handlu książkami: wyszukiwania okazji, oceny ryzyka i opłacalności, zakupu z myślą o odsprzedaży oraz monitorowania ofert i cen. Nie budujemy aplikacji do zarządzania prywatną kolekcją książek.**

Każda planowana funkcja powinna mieć jasne uzasadnienie w procesie handlowym: pozwalać szybciej znaleźć potencjalnie rentowną ofertę, poprawniej wycenić książkę, ograniczyć koszt lub ryzyko zakupu, sprawniej prowadzić zapasy przeznaczone na sprzedaż albo skuteczniej sprzedać towar.

## Aktualny priorytet (od 2026-11-07)

Właściciel projektu nie handluje w tej chwili. Rozwój koncentruje się na **skanerze, katalogu i weryfikacji**: pokrycie i niezawodność źródeł, struktura dzieł/wydań/serii oraz szybkość i trafność rozpoznawania książek. Funkcje stricte handlowe (zysk, koszty, rejestr transakcji, alerty zakupowe) są odłożone do czasu zmiany tej decyzji.

**Zmiana 2026-11-23 (wolna ręka):** Łowca stał się narzędziem terenowym: skan kodu kreskowego aparatem telefonu, wycena także książek spoza katalogu (z ofert o tym samym ISBN, bez przypisywania) i praca bez zasięgu z paczki danych zapisanej na telefonie. Nowe okazje mogą przychodzić jako powiadomienia push na telefon właściciela (po włączeniu; zaszyfrowane, przez usługę powiadomień przeglądarki). Strona sprzedaży nie jest na razie rozwijana (prośba właściciela z 23.11).

**Zmiana 2026-11-20:** na prośbę właściciela Okazje stały się silnikiem rynku. Każde wydanie ma szansę sprzedaży w 30 dni liczoną z czasu wystawienia ofert na Vinted (indeks „Rynek”), okazje są ułożone według oczekiwanej korzyści (oszczędność × ta szansa, nadal bez kosztów i prowizji), a snajper — wyłączony, dopóki właściciel go nie włączy — co kilkanaście minut sprawdza najnowsze ogłoszenia Vinted dla książek z najlepszym obrotem i ogłasza nowe okazje. Rozstrzygnięcie nisza / szeroki rynek ma czytać się z indeksu. **Zmiana 2026-11-23 (wolna ręka):** przy włączonym snajperze co 5 minut czytany jest „strumień” — najnowsze ogłoszenia całej kategorii książek Vinted (1–3 strony przez bramkę); gdy któreś wskazuje dzieło katalogu, osobny skan „najnowsze” tylko tych fraz (do 6); bez dopasowań nie ma skanu. Tytuł tylko wybiera frazę, nigdy nie jest dowodem ISBN; ze strumienia nic nie jest zapisywane (`vinted-stream.mjs`, `BOOKFLIP_SNIPER_STREAM=0` wyłącza). Jedno miejsce w partii szuka po kolei 24 najcenniejszych wydań po ISBN (wyszukiwarka Vinted dopasowuje ISBN z opisu).

**Zmiana 2026-11-15:** na prośbę właściciela wróciła ocena okazji w wąskiej postaci — zakładka „Okazje” pokazuje dostępne oferty wyraźnie poniżej wyceny rynkowej swojego wydania. To porównanie ceny z wyceną, bez kosztów, zysku i statusów zakupu; te pozostają odłożone.

## Założenia właściciela (ustalone, nie pytać ponownie)

- Aplikacja jest dla jednej osoby i działa lokalnie na jej komputerze. Nie budujemy usługi: bez kont, hostingu i wielu użytkowników.
- Cel to dodatkowy dochód z odsprzedaży. Kanał sprzedaży to raczej Vinted, więc punktem odniesienia dla ceny odsprzedaży są ceny z Vinted; dane Allegro mają małe znaczenie.
- Interesują nas polskie wydania („Tylko polskie wydania” jest domyślnie włączone); nie zbieramy wydań obcojęzycznych.
- Wybór między niszą (dotychczasowe frazy to fantastyka i powieści z uniwersów gier) a szerokim rynkiem jest otwarty — rozstrzygać danymi, nie założeniem.
- Ręczna weryfikacja może odbywać się codziennie, więc kolejka decyzji jest normalnym trybem pracy, a nie wyjątkiem.
- Allegro, OLX i (od 17.11.2026) Dedalus nie mają legalnej drogi dostępu ([rozpoznanie](SOURCES-ACCESS-2026-11.md)); nie obchodzimy CAPTCHA ani blokad.
- Identyfikacja przypisuje tylko na dowodzie ISBN. Jedyny automatyczny wyjątek (doprecyzowanie stanu istniejącego, nie zmiana kierunku): ceny odniesienia Empiku, oferta bez ISBN o tytule pasującym ≥ 0,9 do jednego dzieła trafia do „wydania nieustalonego” tego dzieła, odwracalnie (opis: `PRODUCTION-CATALOG.md`, „Zasady integralności”).
- Rejestr zapasu (od 2026-11-21, decyzja zespołu przy pełnej autonomii): stany i daty, bez kwot — kupione, wystawione, sprzedane, odpuszczone (podwidok „Zapas” w Łowcy, `stock.mjs`).
- Praca nad kodem ma być prosta i tania: bez frameworka, bundlera i zależności produkcyjnych; nowe narzędzie tylko wtedy, gdy wyraźnie coś oszczędza.

## Główne procesy

1. **Sourcing:** przeszukiwanie marketplace'ów, wykrywanie nowych ofert, filtrowanie szumu, zapisywanie kryteriów poszukiwania i obserwacja cen.
2. **Weryfikacja towaru:** rozpoznawanie ISBN, tytułu, tomu, wydania, języka, stanu i zawartości zestawu tylko w zakresie potrzebnym do ustalenia, _co jest sprzedawane i ile może być warte_.
3. **Decyzja zakupowa:** cena ogłoszenia, dostawa, prowizje, inne koszty, przewidywana cena odsprzedaży, marża, ROI i margines na ryzyko.
4. **Obsługa handlu:** lista okazji i kandydatów do zakupu, decyzje kupione/odrzucone, koszt nabycia, towary dostępne do odsprzedaży, historia transakcji i wynik finansowy (jako możliwe przyszłe moduły).
5. **Kontrola jakości:** wiarygodność danych ofertowych, aktualność i dostępność ogłoszeń, duplikaty, pomyłki identyfikacji, bezpieczne backupy i diagnostyka.

## Czego świadomie nie rozwijamy

- Inwentarza prywatnej biblioteczki, półek, osobistych zbiorów i „posiadam/chcę mieć” jako celu samego w sobie.
- Wyjątek (2026-11-21, prośba właściciela): „Etykiety” jako ręczne kolekcje właściciela — własne nazwy, ręczna kolejność książek i numer tomu, opcjonalnie podetykiety tylko w widoku etykiety (`label-collections.mjs`, migracja 143; `label-groups.mjs`, migracja 148); zastępują widok „Serie” w katalogu. To organizacja, nie dowód ISBN; reszta tej listy pozostaje w mocy.
- Rynek w etykiecie (2026-11-21): przy etykiecie-kolekcji najtańsza dostępna polska oferta na pozycję i oznaczenie luk w ręcznej numeracji; służy do kupna, nie do list braków (`label-market.mjs`; luki tylko między numerami nadanymi ręcznie, bez procentu kompletności; jeden cel „Kupuję do” dla wszystkich książek etykiety ustawia istniejące cele dzieł).
- List brakujących tomów przygotowywanych dla kolekcjonera, kompletowania serii do własnego użytku i rankingów kompletności kolekcji.
- Funkcji czytelniczych: postęp czytania, recenzje, oceny lektur, rekomendacje do czytania, biblioteczka życzeń.
- Kolekcjonerskich osiągnięć, odznak i personalizacji niezwiązanej z wynikami handlowymi.

**Ważne rozróżnienie:** katalog książek, serie, tomy, wydania, ISBN i zestawy pozostają potrzebne jako **model identyfikacji i wyceny towaru**. Nie usuwamy tych danych ani istniejących ekranów tylko dlatego, że używają słowa „katalog”. Rozwijamy je pod kątem szybszego i trafniejszego handlu, a nie gromadzenia kolekcji.

## Priorytety rozwoju

1. **P0/P1:** trafność wyników skanowania, jakość dopasowania książek i wydań, wiarygodne ceny/dostępność, bezpieczne i wydajne pobieranie danych.
2. **P1/P2:** opłacalność _całkowita_ — zakup + wysyłka + prowizje + inne koszty vs. realistyczna cena sprzedaży; jasne obliczanie zysku, marży i ROI.
3. **P2:** operacyjna lista ofert do zakupu, statusy transakcyjne, koszt nabycia oraz marża na sprzedanym towarze.
4. **P2/P3:** alerty o spadkach cen, nowych rentownych ofertach i powtarzalne skanowanie zgodne z ograniczeniami serwisów.
5. **Później:** raporty handlowe, rotacja zapasów, koszty i rentowność źródeł; wyłącznie wtedy, gdy istnieją sprawdzone dane do tych obliczeń.

## Jak oceniać propozycję nowej funkcji

Przed rozpoczęciem pracy odpowiedzieć na pytania:

- Jaką decyzję handlową ułatwia funkcja i jaki błąd lub koszt ogranicza?
- Skąd biorą się ceny, koszty i informacje o stanie towaru; co jest potwierdzone, a co szacowane?
- Czy pozwoli mierzyć trafność ofert, zysk netto, czas znalezienia okazji albo rotację towaru?
- Czy wymaga dodatkowych zapytań do marketplace'ów, migracji lub zwiększa ryzyko utraty danych?
- Czy jej głównym beneficjentem jest handlarz, czy kolekcjoner? W drugim przypadku **odrzucamy ją albo przeformułowujemy pod handel**.

## Konsekwencje dla dokumentacji i interfejsu

- „Katalog” oznacza katalog identyfikacyjny książek i ofert handlowych, **nie prywatny księgozbiór**.
- „Zestawy”, „Serie” i „Wydania” służą poprawnemu rozpoznaniu, porównaniu wartości i wystawianiu towaru.
- „Lista obserwowanych” służy ocenie kandydatów do zakupu i ceny docelowej, a nie kompletowaniu własnej kolekcji.
- W planach, issue, PR-ach i dokumentach nie proponować domyślnie funkcji kolekcjonerskich ani rozbudowy biblioteczki.

Ta decyzja jest nadrzędną zasadą zakresu produktu; przyszłe zmiany wymagające odejścia od niej powinny być świadomą, osobno uzasadnioną decyzją produktową.
