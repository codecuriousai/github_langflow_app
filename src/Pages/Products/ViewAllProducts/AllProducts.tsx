import React, { useEffect } from 'react'
import { Product } from '../../../types/Product';
import classes from './AllProducts.module.css'
import ProductCard from '../../../Components/ProductCard/ProductCard';
import { useNavigate } from 'react-router-dom';
import SearchBar from '../../../Components/Search/SearchBar';
import { useDispatch, useSelector } from 'react-redux';
import { deleteProduct, fetchProducts, filterProducts, sortProducts } from '../../../reduxStore/actions/productActions';

const AllProducts: React.FC = () => {
    const navigate = useNavigate();
    const dispatch = useDispatch<any>();
    const products = useSelector((state: any) => state.product.products);

    useEffect(() => {
        const loadProducts = async () => {
            dispatch(fetchProducts());
        }
        loadProducts();

    }, [dispatch]);

    const deleteHandler = (id: string) => {
        dispatch(deleteProduct(id));
    }

    const updateHandler = (productData: Product) => {
        navigate(`/home/editProduct/${productData.id}`);
    }

    const searchHandler = (serachKey: string) => {
        dispatch(filterProducts(serachKey));
    }

    const sortHandler = (sorttype: string) => {
        dispatch(sortProducts(sorttype));
    }

    if (!products?.length) {
        return (
            <div className={classes.userContainer}>No Products</div>
        )
    }

    return (
        <>
            <h2 className={classes.title}>All Products</h2>
            <SearchBar serachFn={searchHandler} sortFn={sortHandler} />

            <div className={classes.userContainer}>
                {products && products?.map((eachProduct: Product) => {
                    return <div key={eachProduct.id}>
                        <ProductCard data={eachProduct} onDelete={() => deleteHandler(eachProduct.id)} update={updateHandler} showDscription={true}
                        />
                    </div>
                })}
            </div>
        </>
    )
}

export default AllProducts