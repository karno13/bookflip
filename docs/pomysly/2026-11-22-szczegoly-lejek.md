# Szczegóły Vinted najpierw dla kandydatów na okazje (pomysł nr 10) — odrzucone, brak zmiany kodu

Data: 2026-11-22. Pomiar na kopii projektu (`data/bookflip-catalog.sqlite`, tylko odczyt).

## Jak jest dziś

- `filterVintedPolishOffers` (`scan-engine.mjs`) czyta stronę szczegółów **każdej** oferty Vinted z wyniku wyszukiwania, która nie jest w pamięci podręcznej (`vinted_detail_cache`), bo strona jest potrzebna do ustalenia języka (filtr „tylko polskie”). Limitu na skan nie ma; kolejność odczytu nie zmienia liczby żądań ani tego, które oferty zostaną przyjęte.
- Tempo: 1 nowe żądanie na sekundę, 2 równolegle, przez bramkę. Pamięć podręczna: 11 358 wpisów.
- Jedyny przypadek, w którym kolejność ma znaczenie: odczyt przerwany blokadą (`stopped`) — wtedy reszta listy przepada. Przerwanie przy blokadzie to zachowanie celowe (nie obchodzimy blokad), a sortowanie ofert przez kryterium ceny nie zmieni liczby żądań.

## Pomiar

- Oferty Vinted w kopii: 6668; bez `listed_at`: 2437 (36,5%); bez liczby zdjęć: 2335.
- Brak `listed_at` wynika głównie ze starych wierszy sprzed zapisu pól szczegółów i z decyzji z pamięci podręcznej (te nie niosą pól). Nie z limitu skanu.
- Ile z tych 2437 to kandydaci na okazje (cena <= 0,8 wyceny lub cel „Kupuję do”): nie zmierzono — wynik nie wpłynąłby na decyzję.

## Decyzja

Teza pomysłu („37% ofert bez czasu, bo nie pobrano szczegółów; pobierać tylko dla kandydatów”) nie opisuje stanu kodu: szczegóły są pobierane dla wszystkich nowych ofert i to jest warunek filtra języka, więc lejek „tani filtr, potem drogie potwierdzenie” nie ma co oszczędzać bez utraty ofert polskich (cena nie mówi nic o języku). Zmiana: brak. Ewentualna oszczędność żądań wymagałaby pominięcia odczytu dla ofert drogich, czyli rezygnacji z ich widoczności w katalogu — to zmiana produktowa, nie porządkowa.

## Uzupełnienie: skąd brak `listed_at` i naprawa (2026-11-22)

Pomiar na kopii (6668 ofert Vinted, 2437 bez `listed_at`):

- Dostępność: unconfirmed 1587, available 553, sold 155, unavailable 133, not_seen 9. Do kupienia (unconfirmed/available/reserved): **2140**; z aktywnym dopasowaniem do wydania: 1391.
- W `vinted_detail_cache`: 1537 z 2140 do-kupienia i 171 z 297 pozostałych. Cache **nie ma kolumny wieku** (language, isbn, shipping_cost), więc trafienie w cache nie mogło zgubić wieku, który cache posiada. Błędu „cache ma pole, wiersz oferty nie” nie ma.
- Okazje: z 202 ofert w `listDeals` **153** bez `listed_at` (świeżość okazji spada wtedy na `first_seen_at`, a indeks rynku pomija ofertę).
- **Znaleziony błąd:** 102 oferty miały `listed_at_text='wczoraj'` bez `listed_at` (`listedAtFromAge` nie znało „wczoraj”) — czyli najświeższe, w tym 90 do kupienia, i każda nowa taka oferta traciła datę. Naprawione w parserze + jednorazowe zadanie.
- Zmiana: `listing-age-backfill.mjs` — zadanie w tle czyta stronę ogłoszenia dla ofert do kupienia bez daty (najstarsze pierwsze, 5 na 4 min, przez bramkę, raz na ofertę, `BOOKFLIP_LISTING_AGE=0` wyłącza). Reszta ofert bez daty to wiek wczytywany wprost ze strony; nie ma tańszego źródła (poza migawkami `offer_raw_snapshots`, które mają je tylko dla tych samych 102).
