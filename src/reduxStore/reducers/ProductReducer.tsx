import { initialStoreState, Product } from "../../types/Product";
import { Actions, ActionsType } from "../constants/actions";
import { Action } from 'redux';

const initialState: initialStoreState = {
    productsData: [],
    products: [],
    filteredProducts: { filteredKey: null, products: [] },
    recentProducts: [],
    isLoading: false
};

interface ProductAction extends Action {
    type: ActionsType;
    payload?: any;
}

export const productReducer = (state = initialState, action: ProductAction) => {
    switch (action.type) {
        case Actions.GET_ALL_PRODUCTS:
            return { ...state, products: action.payload, productsData: action.payload };
        case Actions.UPDATE_RECENT_PRODUCTS:
            return {
                ...state,
                recentProducts: updateRecentProducts(state.recentProducts, action, state)
            };
        case Actions.DELETE_PRODUCT:
            return {
                ...state,
                products: deleteProduct(state, action)
            }
        case Actions.CREATE_PRODUCT:
            return {
                ...state,
                products: [...state.products, action.payload]
            }
        case Actions.UPDATE_PRODUCT:
            return {
                ...state,
                products: updatedProducts(state, action.payload)
            }
        case Actions.SORT_BY_HIGH_PRICE:
        case Actions.SORT_BY_LOW_PRICE:
        case Actions.RESET_PRODUCT_SORTING:
            return {
                ...state,
                products: sortProducts(state, action.payload)
            }
        case Actions.FILTER_PRODUCT_SORTING:
            return {
                ...state,
                products: filterProdcuts(state,action)
            }
        default:
            return state;
    }
}

const updateRecentProducts = (recentProducts: Product[] = [], action: any, state: any) => {
    if (action.payload) {
        const currentProduct = recentProducts?.find(v => v.id === action.payload.id)
        if (!currentProduct) {
            return [...recentProducts, action.payload]
        }
    }
    return recentProducts;
}


const deleteProduct = (state: initialStoreState, action: any) => {
    if (action.payload) {
        const products = state?.products?.filter((product: Product) => product.id !== action.payload.id);
        return products;
    }
}

const updatedProducts = (state: initialStoreState, action: any) => {
    const updatedProducts = state.products.map((product) =>
        product.id === action.id ? { ...product, ...action } : product
    );
    return updatedProducts;
}

const sortProducts = (state: initialStoreState, action: any) => {
    if (action === 'low') {
        return [...state.productsData].sort((a, b) => a.price - b.price);
    } else if (action === 'high') {
        return [...state.productsData].sort((a, b) => b.price - a.price);
    } else {
        return [...state.productsData];
    }
}

const filterProdcuts =(state:any,action:any) => {
    return state.productsData.filter((ep: { title: string; }) => ep.title.toLowerCase().includes(action.payload.toLowerCase()));
}
