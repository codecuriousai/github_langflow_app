import React, { createContext, Dispatch, ReactNode, SetStateAction, useState } from 'react';
import { Product } from '../types/Product';


interface ProductContextType {
    products: Product[];
    recentProducts: Product[];
    setProducts: Dispatch<SetStateAction<Product[]>>;
    setRecentProducts: Dispatch<SetStateAction<Product[]>>;
}

const defaultValue: ProductContextType = {
    products: [],
    recentProducts: [],
    setProducts: () => { },
    setRecentProducts: () => { },
};

export const ProductContext = createContext<ProductContextType>(defaultValue);

interface ProductProviderProps {
    children: ReactNode;
}


export const ProductProvider: React.FC<ProductProviderProps> = ({ children }) => {
    const [products, setProducts] = useState<Product[]>([]);
    const [recentProducts, setRecentProducts] = useState<Product[]>([]);

    return (
        <ProductContext.Provider value={{ products, recentProducts, setProducts, setRecentProducts }}>
            {children}
        </ProductContext.Provider>
    );
};
