// src/utils/test-utils.jsx
import React from "react";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { render } from "@testing-library/react";

/**
 * renderWithStore(ui, { preloadedState, reducer, store }?)
 * - reducer: obiect { sliceName: reducerFn } (minim)
 * - preloadedState: state inițial pt store
 */
export function renderWithStore(
  ui,
  {
    preloadedState,
    reducer = {},
    store = configureStore({ reducer, preloadedState }),
    ...renderOptions
  } = {}
) {
  function Wrapper({ children }) {
    return <Provider store={store}>{children}</Provider>;
  }

  return { store, ...render(ui, { wrapper: Wrapper, ...renderOptions }) };
}
