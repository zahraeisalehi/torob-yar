# Progress

## Status
- M0 scaffold: in progress (Next 16, deps, theme tokens)
- M1 data pipeline: done — see numbers below
- Backend routes (chat pipeline, offers, complex, geo, inquiries, shop inbox, health): written, typecheck green

## Data build (npm run build:db)
- shops 6,476 · products 218,118 (with ≥1 sane offer) · offers 315,094 (644 outliers flagged) · complexes 573 · areas 31
- parse rates: complex 63.4% · floor 65.4% · unit 77.0% · installment shops 123 · ترب‌پی shops 190
- app.sqlite 147.6 MB · app.sqlite.gz 46.0 MB · ~95 s

## Fixtures (npm run build:fixtures)
- 42 products (4 scenarios), 924 offers, 1,403 shops (sellers + every shop in their 47 complexes + 5 installment shops), all files < 1.1 MB

## Next
- M3–M8 UI

## Blocked / follow-ups
- (none yet)
