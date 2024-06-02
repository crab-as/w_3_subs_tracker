# Tests
- Simple as 
    - ```anchor test``` 
- Conducted simple business and security testing in `mainState.ts` and `subscribe.ts`. These tests involve basic functionality calls, performing simple business checks, and verifying simple security measures.
- Executed more complex business testing scenarios in `realWorldScenario.ts`. These tests simulate potential real-world scenarios, focusing on verifying business assertions after the performance of functionalities.
- Implemented more complex security checks in `securityChecks.ts`. These tests evaluate authorization to perform various functionalities, ensuring robust security measures are in place.
## ./tests/*.ts Logging
- By setting `shouldDebug = true` in `config.ts`
## On chain logging
- When running local validator after running 
```anchor test``` just visit cat `./program-logs` to see all listed (pseudo) log files or just `cat ./program-logs/*.log`