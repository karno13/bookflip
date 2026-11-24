# Pierwsza sesja kreatywna zespołu — podsumowanie (2026-11-21)

Temat: „Gdybyśmy dzisiaj projektowali BookFlip od zera, jak wyglądałby produkt wyznaczający nowy standard?”
Uczestnicy: product-innovator (10 pomysłów, pełna notatka obok), product-triage (6), scanner-specialist (7), catalog-specialist (7), ui-ux-specialist (6), qa-reviewer (krytyka 10 pomysłów + 6 koncepcji testowania i 14 scenariuszy awarii). Razem ponad 40 koncepcji. Wszystko to hipotezy; żaden eksperyment nie był jeszcze uruchamiany na danych właściciela.

## Wspólne wnioski (zgodność kilku agentów)

- Największa luka: produkt nie weryfikuje własnej tezy. Brak pomiaru, czy ranking „oszczędność × szansa” przewiduje cokolwiek (triage, innowator, QA).
- „Zniknięcie oferty = sprzedaż” to założenie z cenzurą obserwacji i skażeniem częstością skanowania (QA); relisting, rezerwacje i przerwy w skanach zawyżają „sprzedaże”.
- Ślepa większość ofert Vinted bez ISBN to główny ograniczony zasób pokrycia (triage, scanner, catalog, innowator).
- Kolejka weryfikacji jest dziennym kosztem czasu właściciela: sortowanie po wartości odblokowanej i szybkie decyzje (UI, innowator, catalog).
- Najtańsze eksperymenty są offline na kopii bazy, bez żadnego nowego żądania do serwisów.

## Trzy najciekawsze koncepcje

### 1. Okazje z dowodem: dziennik prognoz, kalibracja i symulator rynku
Każda ogłoszona okazja zapisuje w chwili ogłoszenia prognozę (cena, wycena, szansa, wersja konfiguracji skanu); po 7 i 30 dniach rozlicza się ją automatycznie, z grupą kontrolną i przedziałami ufności (Brier, reliability). Symulator ze znaną prawdą (zadany hazard, interwał skanu, cenzura) sprawdza, czy `market-index.mjs` ją odtwarza. Źródła: triage 1, innowator 1–2, QA A/F, scanner 4.
- Pierwszy tani krok: jedno zapytanie/skrypt tylko do odczytu na kopii bazy (odsetek zniknięć okazji vs. oferty bez okazji w 7 i 30 dni) oraz test symulacyjny na `:memory:`.
- Ostrzeżenia z QA: nie oceniać rankingu sygnałem, który go budował; wykluczyć okna po przerwach i niepełnych skanach; zapisywać wycenę z chwili ogłoszenia.

### 2. „Dziś”: plan dnia i kolejka jako szybkie decyzje
Ekran startowy z kilkoma zadaniami na dziś (okazje, decyzje odblokowujące oferty, fraza dająca szum, stan skanu), kolejka z skrótami klawiaturowymi i cofnięciem. Źródła: innowator 9, UI 1–2, catalog 4. Zalążek już istnieje (`/api/today`).
- Pierwszy tani krok: skrypt offline sortujący kolejkę po „wartości odblokowanej” i sprawdzenie na kopii, czy 20 decyzji odblokowuje większość ofert; skróty w istniejącej kolejce, pomiar czasu na decyzję.
- Ostrzeżenia z QA: rozstrzygnięcie „odrzuć” nic nie odblokowuje; deterministyczna kolejność; ślad ręczny (przypisanie, „różne książki”) wypada z planu; link „cała kolejka” zawsze widoczny.

### 3. Odzyskiwanie ofert bez ISBN jako podpowiedzi (nigdy jako przypisanie)
Okładka (skrót percepcyjny), słownik ISBN ze Skupszopu po (tytuł, autor), cena jako detektor anomalii i klasa „kandydat” z osobnym stanem „prawdopodobne”; wszystko tylko podpowiada i wypełnia pole ISBN, człowiek potwierdza. Źródła: scanner 2–3, catalog 5–7, innowator 4–5.
- **Wymaga decyzji właściciela**, jeśli „kandydat” miałby wpływać na wyceny albo automatyczne decyzje; dowodem pozostaje ISBN.
- Pierwszy tani krok: pomiar na kopii bazy, jaki odsetek ofert Vinted nie ma ISBN i ile z nich ma jednoznacznego kandydata; precyzja reguły względem ręcznie potwierdzonych wydań (jeśli < 99%, zostajemy przy ISBN-only).
- Ostrzeżenia z QA: okładki różnych wydań tego samego tytułu są prawie identyczne; miniatury to nowe żądania przez `marketplace-gate.mjs`.

## Fundament przed wszystkimi trzema: zdrowie danych
QA (C, D) i catalog (3, 6): kilka liczb kontrolnych (oferty na skan, odsetek zniknięć po skanie, ceny ≥ 10 000 zł, oferty bez ISBN wg źródła) i test, że pusta strona nie oznacza zniknięć. Chroni wszystkie wnioski, bo cicha zmiana układu Vinted psuje dane bez błędu.

## Pozostałe koncepcje (skrót, do dalszej oceny)
Krzywa cena → szansa; księga zleceń w szczególe wydania (SVG, bez zależności); odwrócony skan „najnowsze” zamiast fraz (change-feed); monitor zniknięć w antykwariatach jako niezależny pomiar sprzedaży; wspólny czytnik JSON-LD zamiast parserów HTML; arbitraż sklepy → Vinted w „Okazjach”; księga dowodów zamiast flagi „zweryfikowano”; graf dzieło–wydanie–seria z jakością krawędzi; uczenie się z decyzji właściciela (tylko kolejność, nie przypisywanie); złote zbiory z decyzji właściciela; testy metamorficzne rankingu; tryb łowcy (ISBN w terenie, wymaga decyzji właściciela o granicy z handlem); wycena cechowa; paczki jako osobny rynek; plan budżetu zapytań w bramce; tryb jednej ręki na telefonie; paleta poleceń (już istnieje, `app/views/palette.js`).

## Założenia, które zespół kwestionuje
Wejściem produktu jest fraza; wycena to jedna liczba na wydanie; ranking może pomijać koszty; źródła są tylko online; zniknięcie to sprzedaż; „bez zależności” znaczy „bez AI”; wszystkie decyzje w kolejce są równie ważne; ISBN-only a ślepa większość ofert (wymaga decyzji właściciela).

## Uwaga operacyjna
Część skryptów „na kopii bazy” wymaga wspólnej funkcji otwarcia tylko do odczytu, która odmawia, gdy ścieżka wskazuje domyślną lokalizację danych właściciela (QA, scenariusz 13). Złote zbiory trzeba anonimizować przed zapisem w repozytorium (scenariusz 14).
