import React, { useEffect, useState } from 'react'
import ProductForm from '../../../Components/ProductForm/ProductForm'
import { initialProductValues, Product } from '../../../types/Product'
import classes from './CreateProduct.module.css'
import { useNavigate, useParams } from 'react-router-dom'
import { useDispatch } from 'react-redux'
import { createProduct, updateProduct } from '../../../reduxStore/actions/productActions'


const CreateProduct: React.FC = () => {
    const [productData] = useState(initialProductValues);
    const [title, setTitle] = useState('Create Product');
    const { id } = useParams<any>();
    const navigate = useNavigate();
    const dispatch = useDispatch<any>()

    useEffect(() => {
        if (id) {
            setTitle('Edit Product');
        } else {
            setTitle('Create Product');
        }
    }, [id]);


    const createProducthandler = async (product: Product) => {
        if (id) {
            await dispatch(updateProduct(product));
        } else {
            await dispatch(createProduct(product));
        }
        navigate('/home/products')
    }
    return (
        <div className={classes.container}>
            <ProductForm product={productData} updateProduct={createProducthandler} formTitle={title} />
        </div>
    )
}

export default CreateProduct;