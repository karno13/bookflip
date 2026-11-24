# Pomiar: literówki i warianty tytułu (pomysł 4, 2026-11-22)

Pomiar na kopii `data/bookflip-catalog.sqlite`, tylko do odczytu, bez sieci. Skrypt liczył oferty Vinted z aktywnym dopasowaniem do wydania (nie `is_unknown`, PLN, cena > 0), czyli w praktyce rozpoznane po ISBN. Stosunek = cena oferty / wartość wydania z `estimateValue` bez tej oferty, podzielona przez współczynnik stanu (tak jak w `deals.mjs`; oferty bez co najmniej 2 obserwacji i bez używanej „żywej” obserwacji pominięto). Okazje: wynik `listDeals` z domyślnymi progami.

## Definicja

Tytuł dzieła i tytuł oferty po złożeniu wielkości liter, polskich znaków (także ł) i interpunkcji:

- **poprawny**: oferta zawiera tytuł dzieła, także z dokładnymi znakami diakrytycznymi (`exact`);
- **bez diakrytyków**: zawiera go dopiero po złożeniu znaków (`diacr`), czyli ta grupa jest poza kryterium;
- **literówka/wariant** (cel pomiaru): nie zawiera go po złożeniu, ale (a) zawiera go po usunięciu spacji, albo (b) każde słowo tytułu (>= 3 znaki) występuje w ofercie dokładnie lub z odległością Levenshteina <= 1 (słowa >= 5 znaków) / <= 2 (>= 9 znaków); (b) łapie też przestawione słowa i dopiski.

## Wyniki

| Grupa | n | mediana cena/wycena | okazje |
| --- | ---: | ---: | ---: |
| poprawny tytuł | 1176 | 1,125 | 89 (7,6%) |
| bez diakrytyków (po złożeniu) | 136 | 1,270 | 9 (6,6%) |
| literówka/wariant | 113 (9 bez spacji, 104 tokeny) | 1,250 | 11 (9,7%) |

Kryterium: >= 30 ofert (spełnione: 113), mediana niższa o >= 10 pp (NIESPEŁNIONE: wyższa o 12,5 pp; różnica okazji +2,1 pp przy n=113 mieści się w szumie).

Przykłady: „Wiedźmin Rozdroże króków” (65 zł przy wycenie 35 zł, 1,86), „Zabójca Trolii” (120 zł / 379 zł, 0,32), „World of warcraft przez mroczny poertal” (180 / 26 zł, 6,9), „Książka Harry Potter i wizien Azkabanu” (11 / 22 zł, 0,50). Wiele trafień grupy (b) to nie literówki, lecz dopiski i inne tytuły wydania (Warhammer, World of Warcraft „Kronika”), a część to zepsute kodowanie („kamieĹ”), więc czysta grupa literówek jest mniejsza od 113.

## Czy fraza bez diakrytyków znajdzie te oferty

Wyszukiwarka Vinted tolerancji literówek nie daje nam żadnej gwarancji, a nie wolno sprawdzać tego siecią w tym zadaniu. Fraza bez polskich znaków znalazłaby oferty z brakującymi znakami (ta grupa jest już dziś w katalogu: 136 ofert, więc są znajdowane obecną frazą lub przez ISBN), ale nie prawdziwe literówki („króków”, „poertal”). Przy tym pomiarze nie ma tu przewagi cenowej, której oczekiwano.

## Werdykt

Kryterium niespełnione: oferty z literówkami nie są tańsze względem wyceny (mediana 1,25 wobec 1,125), udział okazji podobny. Bez zmian w kodzie; pomysł odłożony. Ograniczenie: pomiar widzi tylko oferty, które już zostały dopasowane po ISBN, więc oferty z literówką bez rozpoznanego ISBN w próbie nie występują (możliwe obciążenie).
