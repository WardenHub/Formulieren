# Ember API-observability

De API gebruikt optionele Azure Monitor/Application Insights-instrumentatie. De meetlaag wordt alleen geactiveerd wanneer `APPLICATIONINSIGHTS_CONNECTION_STRING` in de runtimeomgeving aanwezig is; lokaal blijft de API zonder die instelling functioneel zoals voorheen.

## Wat wordt gemeten

- HTTP-aanvragen per route, status en duur;
- afhankelijkheden zoals SQL-aanvragen;
- uitzonderingen en mislukte requests;
- performance counters en cold-startgedrag.

Request bodies, autorisatietokens en formulierinhoud worden niet als telemetry toegevoegd.

## Handige Application Insights-query

```kusto
requests
| summarize Aantal = count(), Gemiddeld_ms = avg(duration), P50_ms = percentile(duration, 50), P95_ms = percentile(duration, 95), P99_ms = percentile(duration, 99), Fouten = countif(success == false) by name
| order by P95_ms desc
```

Voor afhankelijkheden:

```kusto
dependencies
| summarize Aantal = count(), P95_ms = percentile(duration, 95), Fouten = countif(success == false) by target, name
| order by P95_ms desc
```

Voor een eerste-aanvraag/cold-startbeeld:

```kusto
requests
| where timestamp > ago(7d)
| summarize EersteAanvraag_ms = min(duration), P95_ms = percentile(duration, 95) by bin(timestamp, 1h), cloud_RoleName
```

Gebruik in Azure daarnaast een availability test op `/health`. Daarmee worden bereikbaarheid en hersteltijd na een slapende App Service zichtbaar naast de normale requestmetingen.
