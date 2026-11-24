# Mapa drogowa 4 (2026-11-22): od „widzę okazje” do „widzę je pierwszy i uczę się z własnych decyzji”

Poprzednie: mapy 1-3 (wszystkie 6 pozycji mapy 3 zbudowane: wpisy 185-196).

**Fakty** (odczyt `CLAUDE.md`, `docs/PRODUCT-DIRECTION.md`, mapy 3, `CHANGELOG.md` 163-196, `docs/SCHEMA.sql`): `deal_alerts` ma `alerted_at` i `seen_at`; `deal_triage` ma stany `seen/snoozed/dismissed` i `price_at`; `offer_price_history` (cena, `observed_at`); `offers` ma `first_seen_at`, `last_seen_at`, `matched_queries_json`, `observed_isbn`; w schemacie jest też kolumna `listed_at` (czas wystawienia, używany przez indeks rynku; **nie sprawdziłem, w której tabeli ani jak gęsto wypełniona**). Vinted nie podaje nazw sprzedawców (wpis 187). Ostatnia migracja to 147. **Nie czytałem** kodu `deals.mjs`, `market-index.mjs`, `scan-schedule.mjs` ani widoków; opisy ich działania to hipotezy do sprawdzenia przez wykonawcę. Wszystko poniżej liczy się z danych już zebranych; żadne nowe żądanie nie omija `marketplace-gate.mjs`.

**Ocena stanu.** Mapa 3 zamknęła pętlę oferta -> decyzja -> sztuka -> wynik oraz sprawdzenie wycen. Nie mamy jeszcze trzech rzeczy: (1) wiedzy, **ile minut trwa okazja**, czyli czy snajper w ogóle jest szybszy niż konkurencja; (2) sprzężenia zwrotnego z **własnych werdyktów** (każde „nie dla mnie” to dane, które dziś nic nie zmieniają); (3) oferty bez ISBN, które są największym ukrytym zasobem (dokładnie tam konkurencja też nie ma ISBN, więc cena bywa błędna).

---

## 1. Okno przewagi: ile żyje okazja i czy snajper je łapie

**Problem.** Okazje liczą się od ceny wobec wyceny, ale wartość zależy od tego, **czy zdążę przed innymi**. Nie wiemy: ile minut po wystawieniu oferta jest wykrywana, jak długo okazja żyje do zniknięcia, o której godzinie znika najszybciej. Bez tego nie da się ustawić odstępu snajpera ani liczby fraz na podstawie faktów (wpis 188 pokazał, że dane o napływie były artefaktem własnych skanów).
**Widok.** W „Okazje -> Snajper” karta „Okno przewagi”: mediana opóźnienia „wystawiono -> wykryto” (osobno snajper i zwykły skan), rozkład czasu życia okazji (np. „połowa znika w 40 min”, „75% w 3 h”), udział okazji wykrytych po tym, jak już zniknęły (czyli przegapionych), tabela godzin z najkrótszym życiem. Podpowiedź tekstowa: „fraza X: okazje znikają w 20 min, a skanujesz co 45”. Bez automatycznych zmian.
**Dane i pliki.** Bez migracji: `offers` (`listed_at`, `first_seen_at`, `last_seen_at`, `availability`), `deal_alerts.alerted_at`, `deal_alerts.seen_at`. Nowy `deal-lifetime.mjs` (czysta funkcja). Rozszerzenie raportu tygodniowego (`report-week`) o jedną linię.
**Kryteria (bez sieci).**
- Na danych syntetycznych o znanych czasach funkcja zwraca dokładnie te mediany i percentyle; oferta bez `listed_at` jest poza próbą i liczona osobno („bez czasu wystawienia: N”).
- Oferta nadal żywa (nie zniknęła) liczona jako cenzurowana (czas życia „co najmniej”), nie jako zero ani wartość brakująca (test na dwóch ofertach żywych).
- Poniżej 30 okazji w grupie: „za mało danych”, bez liczb.
- Zero żądań (test z `fetcher`, który rzuca); karta nie zmienia rankingu ani ustawień snajpera.
**W / T / R:** wysoka / niska / niskie. **Tani eksperyment:** SQL na kopii bazy: dla okazji z ostatnich 60 dni policzyć medianę `alerted_at - listed_at` i medianę `last_seen_at - listed_at`. Jeśli mediana życia jest > 24 h, wyścig o szybkość jest wtórny i snajper można zwolnić (oszczędność limitów); jeśli < 1 h, snajper musi być szybszy, a fraza z „wolnym” odstępem traci okazje.

## 2. Uczenie się z werdyktów właściciela (przezroczyste wyciszanie, nie czarna skrzynka)

**Problem.** „Nie dla mnie” i „odłóż” dziś tylko chowają jedną ofertę. Jeśli właściciel odrzuca ofertę tego samego wydawcy, serii, przedziału cenowego czy sprzedawcy po raz dwudziesty, aplikacja się nie uczy i szum rośnie wraz z liczbą okazji.
**Widok.** W Okazjach znacznik „zwykle odrzucasz: wydawca X (12 z 14)” przy ofercie, filtr „ukryj zwykle odrzucane” (domyślnie wyłączony, więc nic nie znika bez wiedzy właściciela) i lista „Wyciszenia do zatwierdzenia”: reguły (wydawca, seria, fraza, sprzedawca, przedział ceny) z liczbami „odrzucone / kupione / obejrzane”, każda do jednego kliknięcia „Wycisz” i „Cofnij”. Kupione (Zapas) liczą się jako głos „tak”.
**Dane i pliki.** Migracja 148 (opcjonalna, w wersji 1 bez niej): `mute_rules` (`kind`, `value`, `created_at`, `active`) tylko po zatwierdzeniu. Odczyt: `deal_triage` (stany, `price_at`), `stock_items` (kupione), `offers`/`editions` (wydawca, seria), `matched_queries_json`. Nowy `triage-learning.mjs` (czysta funkcja: licznik odrzuceń vs zakupów na cechę, z dolnym przedziałem ufności, np. Wilsona). Wersja 1: tylko znacznik i lista propozycji, bez reguł.
**Kryteria.**
- Cecha z < 8 werdyktami nie dostaje znacznika; wynik zależy od przedziału ufności, nie od surowego udziału (test: 3 z 3 nie wystarcza, 12 z 14 tak).
- Reguła wyciszenia nigdy nie dotyka ofert z celem „Kupuję do”, ofert obserwowanego sprzedawcy ani ofert, które właściciel kupił wcześniej od tego sprzedawcy; ręczny wybór zawsze wygrywa.
- Wyciszenie jest odwracalne i widoczne w „Ostatnich decyzjach” (marker `created_by`); cofnięta reguła nie jest proponowana ponownie.
- Zero żądań; ranking oczekiwanej korzyści bez zmian przy wyłączonym filtrze (test na tych samych danych).
**W / T / R:** wysoka / średnia / niskie (przy zatwierdzaniu ręcznym). **Tani eksperyment:** SQL na kopii: dla `dismissed` z 90 dni pogrupować po wydawcy i serii; jeśli ≥ 30% odrzuceń przypada na ≤ 5 cech, reguły coś dadzą; jeśli odrzucenia są rozproszone, funkcja odpada.

## 3. Oferty bez ISBN: podpowiedź z okładki (**wymaga decyzji właściciela**)

**Problem.** Reguła „tylko ISBN” słusznie blokuje błędne przypisania, ale oferty bez ISBN zostają w Kolejce albo w „wydaniu nieustalonym”. Zdjęcie okładki to dowód, który człowiek ocenia w sekundę; aplikacja go nie używa.
**Kierunek produktu.** `CLAUDE.md` mówi: „no assignment from title similarity alone”. Okładka to dowód inny niż tytuł, ale zmiana reguły jest decyzją właściciela. **Wersja bezpieczna (bez decyzji):** okładka służy **wyłącznie do uporządkowania kandydatów w Kolejce** (najpierw wydanie, którego okładka wygląda tak samo); przypisanie nadal robi człowiek, jak dziś. **Wersja odważna (decyzja):** przy zgodzie bardzo wysokiej i zgodnym tytule automatyczne przypisanie odwracalne, jak „wydanie nieustalone”.
**Widok.** W Kolejce obok oferty bez ISBN: „najbardziej podobna okładka: [miniatura] Wydanie Y (zgodność 94%)” i przycisk „Zatwierdź” (to ten sam zapis ręczny co dziś). Sortowanie kolejki: oferty z mocną podpowiedzią na górze.
**Dane i pliki.** Migracja 149: `cover_hashes` (`edition_id` lub `offer_id`, `dhash`, `source`, `computed_at`). `cover-hash.mjs` (czysty algorytm różnicowego skrótu 9x8 z tablicy pikseli, porównanie odległością Hamminga). **Główna trudność:** Node bez zależności nie dekoduje JPEG; wymaga albo małego dekodera, albo wywołania `System.Drawing` przez PowerShell (tylko Windows, ograniczenie, które trzeba uczciwie ocenić), albo decyzji o jednej zależności (wbrew „bez nowych zależności bez wyraźnej oszczędności”). Pobieranie obrazów **tylko** przez `readSourceHtml` / istniejącą ścieżkę z bramką; okładki katalogowe już są w `images` (**nie sprawdziłem, czy lokalnie**).
**Kryteria.**
- Czysta funkcja skrótu i odległości przetestowana na tablicach pikseli (identyczny obraz = 0, zmniejszony/przycięty o kilka pikseli < próg, inna okładka > próg); bez sieci i bez prawdziwych JPEG w teście.
- Podpowiedź nie tworzy przypisania ani wpisu w `review_decisions`; bez zatwierdzenia człowieka oferta pozostaje w Kolejce (test).
- Brak okładki katalogowej lub oferty: „brak podstawy”, nie zgadywanie; ta sama okładka u dwóch wydań (wznowienie): zwracane są oba, bez wyboru.
- Wersja odważna (tylko po decyzji): przypisanie ma marker `created_by`, widoczne w „Ostatnich decyzjach”, cofnięte nie wraca.
**W / T / R:** wysoka (to największy ukryty zasób) / wysoka / średnie (dekoder, kierunek produktu). **Tani eksperyment:** ręcznie, bez kodu: 30 ofert z Kolejki, dla każdej właściciel zgaduje wydanie wyłącznie z okładki; jeśli w ≥ 70% trafia i zgadza się z późniejszym ISBN, podpowiedź ma sens. Drugi krok: sprawdzić, czy jest dekoder obrazów w środowisku bez zależności (osobne rozpoznanie).

## 4. Obniżki cen i „sugerowana oferta” (negocjacja zamiast ceny z etykiety)

**Problem.** Oferta wiszącą długo, której sprzedawca już obniżał cenę, jest tańsza niż pokazuje etykieta: Vinted pozwala składać własną cenę. Aplikacja widzi cenę, ale nie widzi, że ta oferta **dojrzewa do obniżki**; nie wie też, jak często sprzedawcy w ogóle schodzą z ceny.
**Widok.** W Okazjach znaczniki „obniżona 2 razy, ostatnio -15%” i „wisi 41 dni” oraz sugestia „spróbuj zaproponować X zł” (cena z historii obniżek: mediana relatywnej obniżki dla ofert w podobnym wieku). Lista „Prawie okazje”: oferty, które po sugerowanej obniżce byłyby okazją (filtr, nie nowy alert). Bez kosztów i zysku; liczba jest podpowiedzią, nie ceną docelową.
**Dane i pliki.** Bez migracji: `offer_price_history` (kolejne ceny i `observed_at`), `offers.listed_at`, `first_seen_at`. Nowy `price-drops.mjs` (czysta funkcja: zdarzenia obniżek, rozkład obniżek według wieku oferty i przedziału ceny; model empiryczny, nie parametryczny). Filtr „prawie okazje” obok „od obserwowanych”.
**Kryteria.**
- Na syntetycznej historii z trzema obniżkami wynik odtwarza liczbę i procent; wzrost ceny nie jest „obniżką”; zmiana ceny między skanami przy dużej luce czasowej liczona jest jako jedno zdarzenie z przybliżoną datą.
- Poniżej 30 zdarzeń obniżek w grupie wiek x cena: bez sugestii („za mało danych”).
- Sugerowana cena nigdy nie przekracza obecnej ceny i nie schodzi poniżej `0,6 x` obecnej (stały próg w kodzie, test granic); cena zawsze w groszach i < 10 000 zł.
- Zero żądań; bez zmiany rankingu okazji.
**W / T / R:** średnia-wysoka / niska / niskie (ryzyko: Vinted często nie ujawnia, czy cena była negocjowana, więc to tylko podpowiedź). **Tani eksperyment:** SQL na kopii: dla ofert z ≥ 2 obserwacjami ceny policzyć, jaki odsetek obniżył cenę w 30 dni i o ile mediana; jeśli < 8% ofert kiedykolwiek obniża, sygnał jest pomijalny.

## 5. Sezonowość: kalendarz rynku i mnożnik „teraz vs zwykle”

**Problem.** Wycena i szansa 30 dni to jedna liczba przez cały rok. Książki mają sezony (lektury szkolne przed wrześniem, prezenty przed Bożym Narodzeniem, fantastyka latem, podręczniki), więc zakup „na zapas” w złym miesiącu zamraża towar, a w dobrym przynosi więcej, niż pokazuje indeks.
**Widok.** (a) W Rynku zakładka „Kalendarz”: tydzień roku x liczba nowych ofert i znikających, dla całości i dla wybranych dzieł/serii/autorów (z karty z wpisu 179). (b) Znacznik przy okazji „sezon: za 6 tygodni popyt +30%” albo „poza sezonem” **tylko** gdy dane mają ≥ 52 tygodni historii (do tego czasu pokazuje tylko wzorzec tygodnia i godziny, który da się policzyć już dziś). (c) W Zapasie podpowiedź „odłóż wystawienie do …” zamiast obniżki, gdy sezon blisko (tylko tekst).
**Dane i pliki.** Bez migracji: `offers.listed_at`, `last_seen_at`, `availability`. `seasonality.mjs` (czysta funkcja: indeks sezonowy = udział tygodnia w rocznej sumie, z wygładzeniem i dolną granicą próbek). Źródło zewnętrzne (kalendarz szkolny, święta) tylko jako stała w kodzie, nie pobierane.
**Kryteria.**
- Na danych syntetycznych z sezonowym szczytem w znanym tygodniu funkcja zwraca szczyt w tym tygodniu; przy płaskich danych indeks ≈ 1 w całym roku (bez złudnych wzorców; test z losowym szumem i stałym ziarnem).
- Mniej niż 52 tygodnie historii: brak indeksu rocznego, komunikat „za mało historii”, ale wzorzec dnia tygodnia dostępny.
- Seria z < 100 ofert: bez własnego indeksu, użyty ogólny (opisane w interfejsie).
- Indeks sezonowy nie zmienia wyceny ani rankingu, tylko opis (test na tych samych danych).
**W / T / R:** średnia (wysoka po roku danych) / średnia / niskie. **Tani eksperyment:** na kopii policzyć rozpiętość danych (`min(first_seen_at)` do `max(last_seen_at)`) i histogram nowych ofert na miesiąc; jeśli dane mają < 6 miesięcy, zacząć od samego wzorca dnia tygodnia i odłożyć resztę; jeśli ich jest więcej, od razu sprawdzić, czy sierpień-wrzesień różni się o ≥ 25% w kategoriach „lektury”.

## 6. Zestawy: wycena lotu z opisu (jako podpowiedź, nie przypisanie)

**Problem.** Zestawy („10 książek za 40 zł”) są dziś wyłączone z wycen i paczek; to tam konkurencja najczęściej widzi tylko „hurt”, a pojedyncze pozycje bywają warte więcej niż cena lotu podzielona na sztuki. Aplikacja nic o nich nie mówi.
**Widok.** Przy ofercie oznaczonej jako zestaw: „w opisie znaleziono N tytułów z Twoich celów lub katalogu”, lista dopasowanych dzieł z wyceną **każdego**, suma wycen i porównanie do ceny lotu („łącznie wyceniono 7 z 10 pozycji na 74 zł przy cenie 40 zł”). Oznaczenie „zestaw z celem” w Okazjach (filtr, nie zmiana rankingu).
**Dane i pliki.** Bez migracji w wersji 1; odczyt: opis oferty z detalu (`source-details.mjs`, **nie sprawdziłem, czy opis jest zapisywany**; jeśli nie, funkcja wymaga zapisu opisu, więc migracji), dzieła i ich wyceny. `lot-hints.mjs` (czysta funkcja: rozbicie opisu na linie, dopasowanie ostrożne do tytułów dzieł z normalizacją). **Zgodność z regułą ISBN:** dopasowanie z opisu to tylko podpowiedź tekstowa; nic nie tworzy przypisania ani sztuki, a oferta zestawu pozostaje poza wycenami wydań (wartość zawsze „szacunkowa, bez dowodu ISBN”, inny wygląd niż okazja).
**Kryteria.**
- Z opisu „Tom 1, 2 i 3 Wiedźmina oraz Pan Lodowego Ogrodu” funkcja zwraca tylko tytuły, których dopasowanie przekracza próg i nie jest niejednoznaczne (dwa dzieła o tym samym tytule: bez wyboru).
- Opis bez tytułów: „nie rozpoznano”, bez liczby; suma wycen liczy tylko pozycje z wiarygodną wyceną (wysoka/średnia pewność).
- Żadnego zapisu przypisania ani wpisu w `review_decisions` (test: stan tabel przed i po).
- Zero żądań poza już istniejącym pobieraniem szczegółów przez bramkę.
**W / T / R:** średnia / średnia (rozbicie tekstu po polsku, formy odmienione) / średnie (fałszywe dopasowania wprowadzają w błąd, więc tylko jako podpowiedź). **Tani eksperyment:** ręcznie przejrzeć 20 ofert zestawów z kopii i policzyć, w ilu opis wymienia tytuły (a nie „różne książki”); jeśli < 30%, funkcja odpada.

---

## Uproszczenia i higiena (bez nowych funkcji)

- **Czas życia okazji w raporcie tygodniowym** (z pozycji 1) zamiast osobnej karty, jeśli właściciel woli mniej ekranów.
- **`CLAUDE.md` „last: 145”** przy migracji 147 jest nieaktualne: poprawić w tym samym commicie co następną migrację.
- **Wszystkie funkcje z wpisów 185-196 nie były oglądane na prawdziwych danych.** Przed pozycjami 2 i 4 jeden cykl „kopia bazy -> uruchom nowe widoki -> zapisz liczby” zamiast kolejnego pisania na ślepo.

## Kolejność wdrożenia

1. **Okno przewagi (1)** — najtańsze, bez migracji i bez sieci; odpowiada, czy cała reszta (snajper, obserwowani, frazy) w ogóle gra o właściwą stawkę.
2. **Uczenie się z werdyktów (2), wersja 1** — znaczniki i propozycje bez reguł; reguły wyciszenia po tygodniu użycia.
3. **Obniżki cen i sugerowana oferta (4)** — te same dane co (1), niski koszt, szybki zwrot przy kupowaniu.
4. **Sezonowość (5)** — wzorzec dnia tygodnia od razu, roczny indeks po zebraniu danych (zacząć zapisywać nic nowego: dane już są).
5. **Zestawy (6)** — po sprawdzeniu, czy opis jest zapisywany.
6. **Okładka (3)** — po decyzji właściciela i rozpoznaniu dekodera; największa wartość, największy koszt.

## Trzy najlepsze

1. **Okno przewagi (1):** zmienia strategię skanowania na faktach i jest prawie darmowe; jej wynik może unieważnić (albo potwierdzić) wyścig o szybkość.
2. **Uczenie się z werdyktów (2):** zamienia każdą decyzję właściciela w oszczędność uwagi; reguły są jawne i odwracalne, więc nie psują „ręczne zawsze wygrywa”.
3. **Okładka (3):** największy ukryty zasób (oferty bez ISBN), ale wymaga decyzji właściciela i dekodera; warto zacząć od ręcznego eksperymentu 30 ofert, który nic nie kosztuje.

## Założenia, które kwestionuję

- **„Szybciej niż konkurencja” jako cel snajpera:** nikt nie zmierzył, czy okazje żyją minuty czy dni; od tego zależy sens zużycia limitów i bramki (1).
- **„Odrzucenie to tylko ukrycie jednej oferty”:** to dane o gustach właściciela, dziś wyrzucane (2).
- **„Zestaw nie ma wartości do oceny”:** wyłączenie zestawów z wycen jest bezpieczne, ale oddaje pole, na którym brak konkurencji ISBN jest największy (6).
- **„Cena na etykiecie to cena do zapłacenia”:** na Vinted jest negocjowalna; model bez historii obniżek zaniża okazje (4).
- **„Reguła ISBN wyklucza każdy inny dowód”:** reguła chroni przed zgadywaniem po tytule; okładka jest dowodem innej klasy, ale decyzja o jej użyciu jest właściciela (3).
- **„Jedna wycena na cały rok”:** rynek książek jest sezonowy; do czasu 52 tygodni danych sezonowość pozostaje hipotezą (5).
- **Ciągłe „nie oglądane na prawdziwych danych”** (wpisy 185-196): liczba funkcji rośnie szybciej niż wiedza, które z nich działają; pomiary na kopii mają teraz większy priorytet niż kolejne ekrany.

## Kogo zapytać

- **Właściciel:** czy wolno użyć okładki jako dowodu (wersja bezpieczna: tylko sortowanie kandydatów; odważna: odwracalne przypisanie) i czy wolno wywołać `System.Drawing` przez PowerShell do dekodowania (3).
- **Data/analityk:** gęstość `listed_at` i `offer_price_history`, rozpiętość danych (1, 4, 5).
- **Backend/QA:** reguła cenzurowania żywych ofert w czasie życia (1), przedział ufności werdyktów (2), brak przecieku danych z przyszłości (5).
- **UX/frontend:** ile miejsca w Okazjach zostaje na kolejne znaczniki (zasada „mniej zakładek”) i wygląd na telefonie.
