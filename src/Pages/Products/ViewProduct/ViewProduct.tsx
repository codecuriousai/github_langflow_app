import { useEffect, useState } from 'react';
import classes from './ViewProduct.module.css'
import { useNavigate, useParams } from 'react-router-dom';
import { initialProductValues } from '../../../types/Product';
import { useDispatch, useSelector } from 'react-redux';
import { updateRecentProducts } from '../../../reduxStore/actions/productActions';

const ViewProduct = () => {
    const [productData, setProductData] = useState(initialProductValues)
    const { id } = useParams<any>();
    const navigate = useNavigate();
    const dispatch = useDispatch();
    const products = useSelector((state: any) => state.product.products)

    useEffect(() => {
        const currentProduct = products.filter((eachProduct: any) => eachProduct.id?.toString() === id);
        setProductData(currentProduct[0]);
        dispatch(updateRecentProducts(currentProduct[0]))
    }, [id])

    if (!productData) {
        return <div>No Product data</div>
    }

    const backButtonHandler = () => {
        navigate('/home/products')
    }

    return (
        <div>
            <div className={classes.detailContainer}>
                {/* <!-- Product Details --> */}
                <div className={classes.productDetail}>
                    <a href="#"><i className="fa fa-arrow-left" onClick={backButtonHandler} ></i></a>
                    {/* <!-- Images --> */}
                    <div className={classes.productImages}>
                        <img src={productData.images[0]} alt="Main Product Image" className={classes.mainImage} />
                        <div className={classes.thumbnailImages}>
                            <img src={productData.thumbnail} alt="Thumbnail 1" />
                        </div>
                    </div>

                    {/* <!-- Info --> */}
                    <div className={classes.productInfo}>
                        <h1>{productData.title}</h1>
                        <p className={classes.sku}>Category : <strong>{productData.category}</strong></p>
                        <p className={classes.price}>${productData.price}</p>
                        <p className={classes.paymentInfo}>Brand : <strong>{productData.brand}</strong>.</p>

                        <div className={classes.options}>
                            <p className={classes.optionLabel}>Stock</p>
                            <div className={classes.optionButtons}>
                                <button className={classes.active}>{productData.availabilityStatus}</button>
                            </div>
                        </div>
                        <div className={classes.actionsWrapper}>
                            {/* <!-- Quantity --> */}
                            <div className={classes.quantitySection}>
                                <button>-</button>
                                <input type="text" className={classes.quantityInput} value="1" />
                                <button>+</button>
                            </div>

                            {/* <!-- Actions --> */}
                            <div className={classes.actions}>
                                <button className={classes.addToCart}>Add to Cart</button>
                                <button className={classes.buyNow}>Buy Now</button>
                            </div>
                        </div>
                        {/* <!-- Additional Info (Free Shipping, Support, Warranty, Delivery) --> */}
                        <div className={classes.additionalInfo}>
                            <p><strong>Free Shipping on Orders Over {productData.minimumOrderQuantity} Products</strong></p>
                            <p><strong>24/7 Customer Support:</strong> +1-800-123-4567</p>
                            <p><strong>{productData.warrantyInformation}</strong></p>
                            <p><strong>Delivery:</strong> 3 - 5 Business Days</p>
                            <p><strong>{productData.returnPolicy}</strong></p>
                        </div>
                        <div className={classes.tabContent}>
                            <p>{productData.description}</p>
                        </div>
                    </div>
                </div>

                {/* <!-- Tabs for Additional Info --> */}
                <div className={classes.tabs}>
                    <button className={classes.active}>Description</button>
                    <button>Specifications</button>
                    <button>Shipping & Returns</button>
                    <button>Warranty</button>
                </div>

                <div className={classes.tabContent}>
                    <p>{productData.description}</p></div>

                {/* <!-- Reviews --> */}
                <div className={classes.reviews}>
                    <h2>Customer Reviews</h2>
                    <div className={classes.reviewContainer}>
                        {productData.reviews.map(e => {
                            return (
                                <div className={classes.reviewComment}>
                                    <p><strong>{e.reviewerName}</strong></p>
                                    <p>Comment : <strong>{e.comment}</strong></p>
                                    <p>Rating : <strong>{e.rating}</strong></p>
                                    {/* : {e.comment} <span>Rating : {e.rating}</span> */}
                                </div>
                            )
                        })}
                    </div>

                </div>
            </div>
            {/* <!-- Footer --> */}
            <footer>
                <p>&copy; XYZ Store. All rights reserved.</p>
            </footer>
        </div>
    )
}

export default ViewProduct;