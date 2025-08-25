import { combineReducers } from "redux";
import { productReducer } from "./ProductReducer";

const rootReducer = combineReducers({
    product: productReducer
})

export type RootState = ReturnType<typeof rootReducer>;

export default rootReducer;