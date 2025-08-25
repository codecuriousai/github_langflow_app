import { Product } from "../../types/Product"
import { Actions } from "../constants/actions"
import { Dispatch } from "redux";
import { ThunkAction } from "redux-thunk";
import { RootState } from "../reducers";
import axios from "axios";

type AppThunk<ReturnType = void> = ThunkAction<
    ReturnType,
    RootState,
    unknown,
    ProductAction
>;

export type ProductAction =
    | { type: 'GET_ALL_PRODUCTS'; payload?: any | Error }
    | { type: 'GET_SINGLE_PRODUCT'; payload?: any | Error }
    | { type: 'UPDATE_PRODUCT'; payload?: any | Error }
    | { type: 'CREATE_PRODUCT'; payload?: any | Error }
    | { type: 'DELETE_PRODUCT'; payload?: any | Error }
    | { type: 'UPDATE_RECENT_PRODUCTS'; payload?: any | Error }

const headers = { 'Content-Type': 'application/json' };


export const fetchProducts = (): AppThunk => async (dispatch: Dispatch<any>) => {
    try {
        const response = await axios.get('http://localhost:8000/products');
        const products = response.data;
        dispatch({
            type: Actions.GET_ALL_PRODUCTS,
            payload: products
        });
    } catch (error) {
        console.error('Error fetching data:', error);
        dispatch({
            type: Actions.GET_ALL_PRODUCTS,
            payload: error
        });
    }
}

export const createProduct = (product: Product): AppThunk => async (dispatch: Dispatch<any>) => {
    const url = 'http://localhost:8000/products';
    product.id = Math.floor(Math.random() * (9 - 1 + 1) * 10000).toString();
    try {
        const response = await axios.post(url, product, { headers });
        if (response.data) {
            dispatch({
                type: Actions.CREATE_PRODUCT,
                payload: response.data
            });
        }
    } catch (error) {
        console.log("🚀 ~ createProducthandler ~ error:", error);
        dispatch({
            type: Actions.CREATE_PRODUCT,
            payload: error
        });
    }
}

export const updateProduct = (product: Product): AppThunk => async (dispatch: Dispatch<any>) => {
    const url = `http://localhost:8000/products/${product.id}`;
    try {
        const response = await axios.put(url, product, { headers });
        if (response.data) {
            dispatch({
                type: Actions.UPDATE_PRODUCT,
                payload: response.data
            });
        }
    } catch (error) {
        console.log("🚀 ~ createProducthandler ~ error:", error);
        dispatch({
            type: Actions.UPDATE_PRODUCT,
            payload: error
        });
    }
}

export const updateRecentProducts = (product: Product) => {
    return {
        type: Actions.UPDATE_RECENT_PRODUCTS,
        payload: product
    }
}


export const setAllProducts = (products: Product[]) => {
    return {
        type: Actions.GET_ALL_PRODUCTS,
        payload: products
    }
}


export const deleteProduct = (id: string): AppThunk => async (dispatch: Dispatch<any>) => {
    const url = `http://localhost:8000/products/${id}`;

    try {
        const response = await axios.delete(url, { headers });
        if (response.data) {
            dispatch({
                type: Actions.DELETE_PRODUCT,
                payload: { id }
            });
        }
    } catch (error) {
        console.error('Error fetching data:', error);
        dispatch({
            type: Actions.DELETE_PRODUCT,
            payload: error
        })
    }
}

export const sortProducts = (sortType: string | null) => {
    if (sortType === 'low') {
        return {
            type: Actions.SORT_BY_HIGH_PRICE,
            payload: sortType
        }
    } else if (sortType === 'high') {
        return {
            type: Actions.SORT_BY_HIGH_PRICE,
            payload: sortType
        }
    } else {
        return {
            type: Actions.RESET_PRODUCT_SORTING,
            payload: null
        }
    }
}

export const filterProducts = (serachKey: string) => {
    return {
        type: Actions.FILTER_PRODUCT_SORTING,
        payload: serachKey
    }
}
