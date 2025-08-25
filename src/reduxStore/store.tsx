import { createStore, applyMiddleware, compose } from 'redux';
import {thunk , ThunkMiddleware } from 'redux-thunk';
import rootReducer from './reducers/index';

// for using Redux DevTools
const composeEnhancers = (window as any).__REDUX_DEVTOOLS_EXTENSION_COMPOSE__ || compose;

const store = createStore(
  rootReducer,
  composeEnhancers(applyMiddleware(thunk as unknown as ThunkMiddleware<any, any>))
);

export type AppDispatch = typeof store.dispatch;
export default store;