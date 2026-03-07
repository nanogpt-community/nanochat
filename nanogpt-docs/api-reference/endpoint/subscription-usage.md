# Subscription Usage

## Overview

Returns subscription status and current usage for the active billing period. Subscription usage is tracked as weekly input tokens (60M/week) and daily image generations (100/day).

## Request

* Method: `GET`
* Path: `/api/subscription/v1/usage`
* Auth: `Authorization: Bearer <api_key>` or `x-api-key: <api_key>`

## Response

`200 application/json`. Timestamps are UNIX epoch milliseconds.

```json  theme={null}
{
  "active": true,
  "provider": "stripe",
  "providerStatus": "active",
  "providerStatusRaw": "active",
  "stripeSubscriptionId": "sub_...",
  "limits": {
    "weeklyInputTokens": 60000000,
    "dailyInputTokens": null,
    "dailyImages": 100
  },
  "allowOverage": false,
  "period": {
    "currentPeriodEnd": "2026-03-17T14:21:22.000Z"
  },
  "dailyImages": {
    "used": 0,
    "remaining": 100,
    "percentUsed": 0,
    "resetAt": 1772928000000
  },
  "dailyInputTokens": null,
  "weeklyInputTokens": {
    "used": 8,
    "remaining": 59999992,
    "percentUsed": 1.3333333333333334e-7,
    "resetAt": 1773014400000
  },
  "state": "active",
  "graceUntil": null
}
```

Fields

* `active` — Whether the account is currently active for subscription usage.
* `provider` — Subscription provider (e.g. `stripe`).
* `providerStatus`, `providerStatusRaw` — Provider-level subscription status.
* `limits.weeklyInputTokens` — Weekly input token allowance (60,000,000).
* `limits.dailyInputTokens` — Daily input token allowance (null if not enforced).
* `limits.dailyImages` — Daily image generation allowance (100).
* `allowOverage` — Whether overage beyond limits is permitted.
* `weeklyInputTokens.used` — Input tokens consumed in the current weekly window.
* `weeklyInputTokens.remaining` — Remaining input token allowance for the week.
* `weeklyInputTokens.percentUsed` — Decimal fraction in \[0,1].
* `weeklyInputTokens.resetAt` — Millisecond epoch when the weekly window resets.
* `dailyImages.used` — Image generations consumed today.
* `dailyImages.remaining` — Remaining image generations for today.
* `dailyImages.percentUsed` — Decimal fraction in \[0,1].
* `dailyImages.resetAt` — Millisecond epoch when the daily window resets.
* `dailyInputTokens` — Daily input token usage (null if not enforced).
* `period.currentPeriodEnd` — ISO timestamp for the end of the current billing period.
* `state` — One of `active`, `grace`, `inactive`.
* `graceUntil` — ISO timestamp when grace access ends (if applicable).

## Usage semantics

* Weekly input tokens represent the total input tokens consumed across all subscription-covered text generation requests in the current week.
* Daily images represent the number of subscription-covered image generations in the current day.
* Weekly window resets once per week; daily image window resets at the next UTC day start.

## Examples

<CodeGroup>
  ```bash cURL theme={null}
  curl -s \
    -H "Authorization: Bearer $NANOGPT_API_KEY" \
    https://nano-gpt.com/api/subscription/v1/usage | jq
  ```

  ```ts JavaScript/TypeScript theme={null}
  const res = await fetch('https://nano-gpt.com/api/subscription/v1/usage', {
    headers: { 'Authorization': `Bearer ${NANOGPT_API_KEY}` },
  });
  const data = await res.json();
  ```
</CodeGroup>


---

> To find navigation and other pages in this documentation, fetch the llms.txt file at: https://docs.nano-gpt.com/llms.txt
