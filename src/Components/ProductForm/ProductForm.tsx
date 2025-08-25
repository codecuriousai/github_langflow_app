import React, { useEffect, useState } from "react"
import { Formik, Form, Field, ErrorMessage } from 'formik';
import * as Yup from 'yup';
import classes from './ProductForm.module.css';
import { initialProductValues, Product } from "../../types/Product";
import { useNavigate, useParams } from "react-router-dom";
import { useSelector } from "react-redux";

type ProductFormProps = { formTitle?: string, product?: Product, updateProduct: (product: Product) => void }

const ProductForm: React.FC<ProductFormProps> = ({ formTitle, updateProduct }) => {
    const products = useSelector((state: any) => state.product.products)
    const [productData, setProductData] = useState(initialProductValues);
    const [hasId, setHasId] = useState(false);
    const { id } = useParams<any>();
    const navigate = useNavigate()

    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
    }, []);

    useEffect(() => {
        const currentProduct = products.filter((eachProduct:Product )=> eachProduct.id.toString() == id);
        setProductData(currentProduct[0])
        setHasId(!!id); // Set hasId to true if id exists, otherwise false
    }, [id])



    const validationSchema = Yup.object({
        title: Yup.string().label('Title').required('Title is required'),
        stock: Yup.number().min(1, 'You must be at least 18 years old').required('Stock is required'),
        category: Yup.string().required('Category is required'),
        description: Yup.string().required('Description is required'),
    });

    const formSubmit = (values: Product, { setSubmitting }: any) => {
        updateProduct(values);
        setSubmitting(false);
    }

    const backNavitationHandler = () => {
        navigate('/Home/products')
    }

    return <div className={classes.container}>
        <div className={classes.card}>
            <h3 className={classes.title}>{formTitle}</h3>
            <Formik initialValues={hasId ? productData : initialProductValues} validationSchema={validationSchema} onSubmit={formSubmit} enableReinitialize>
                {({ isSubmitting, errors, touched }) => (
                    <Form className={classes.formContainer}>
                        <div className={classes.formGroup}>
                            <label htmlFor="title" className={classes.label}>Title</label>
                            <Field type="title" name="title" className={classes.inputField} />
                            <ErrorMessage className={classes.errorMessage} name="title" component="div" />
                        </div>

                        <div className={classes.formGroup}>
                            <label htmlFor="price" className={classes.label}>Cost</label>
                            <Field type="number" name="price" className={classes.inputField} />
                            <ErrorMessage className={classes.errorMessage} name="price" component="div" />
                        </div>
                        <div className={classes.formGroup}>
                            <label htmlFor="category" className={classes.label}>Category</label>
                            <Field type="text" name="category" className={classes.inputField} />
                            <ErrorMessage className={classes.errorMessage} name="category" component="div" />
                        </div>
                        <div className={classes.formGroup}>
                            <label htmlFor="description" className={classes.label}>Description</label>
                            <Field type="text" name="description" className={classes.inputField} />
                            <ErrorMessage className={classes.errorMessage} name="description" component="div" />
                        </div>
                        <div className={classes.formGroup}>
                            <label htmlFor="stock" className={classes.label}>Stock</label>
                            <Field type="number" name="stock" className={classes.inputField} />
                            <ErrorMessage className={classes.errorMessage} name="stock" component="div" />
                        </div>
                        <div className={classes.buttonGroup} >
                            <button type="button" className={`${classes.submitButton} ${classes.cancel}`} disabled={isSubmitting} onClick={backNavitationHandler}>
                                Cancel
                            </button>
                            <button type="submit" className={classes.submitButton} disabled={isSubmitting}>
                                Submit
                            </button>
                        </div>
                    </Form>
                )}
            </Formik>
        </div>
    </div>
}

export default ProductForm;