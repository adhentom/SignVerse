# Website verification

## Static result: PASS with limitations

Website extraction filters visible content through the generic adapter, excludes scripts/styles/advertisement selectors, creates bounded ContentPackets, debounces MutationObserver updates, and cleans up the observer/timer. The streaming hook segments new sentences and sends them through the background port.

## Runtime result

Manual verification required. Use a long Wikipedia article, a dynamic page, SPA navigation, rapid refresh, and two tabs. Confirm extraction starts before full-page completion, packets are not duplicated, and the sidebar/renderer remain stable for a long session.
