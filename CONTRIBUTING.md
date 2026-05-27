# Contributing Guidelines

## General

- **KISS**: Keep it simple, stupid
- **Avoid writing unnecessary exception handling** - Objects should handle exceptions only for what they are responsible for.
  - **Fail-Fast**: Hiding an error is worse than throwing an error.
- Write code worthy of the library level. Remove unnecessary elements.

## Code Style

This project uses [Prettier](https://prettier.io/) as its code formatter. Follow MDN's Prettier configuration:

```json
{
  "bracketSameLine": true
}
```
