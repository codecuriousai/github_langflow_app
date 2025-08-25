import { useState } from 'react'
import classes from './ProductCard.module.css';
import { Product } from '../../types/Product';
import { useNavigate } from 'react-router-dom';


type CardProps<T> = {
    data: Product,
    onDelete?: (userId: string) => void,
    update?: (user: Product) => void,
    showDscription: boolean
};


const ProductCard = <T,>({ data, onDelete, update, showDscription }: CardProps<T>) => {
    const [isEdit, setIsEdit] = useState(false);
    const navigate = useNavigate();

    const handleUpdateProduct = (updatedProduct: Product) => {
        if (update) {
            update(updatedProduct);
        }
        setIsEdit(false);
    };

    const discountPrice = (price: number, discountPercentage: number) => {
        const discountedPrice = price - (price * (discountPercentage / 100));
        return discountedPrice.toFixed(2);
    };

    const viewProductHandler = (id: string) => [

        navigate(`/home/viewproduct/${id}`)
    ]

    return (
        <div className={showDscription ? classes.productCard : classes.productCardSmall} key={data.id}>
            {data.stock < 10 && <div className={classes.badge}>Hot</div>}
            <div className={showDscription ? classes.productTumb : classes.productTumbSmall}>
                <img src={data.images[0]} alt="" />
            </div>
            {showDscription && <div className={classes.productDetails}>
                <span className={classes.productCatagory}>{classes.category}</span>
                <h4><a href="">{data.title.length > 12 ? `${data.title.slice(0, 12)}...` : data.title}</a></h4>
                <p>
                    {data.description.length > 80 ? `${data.description.slice(0, 80)}...` : data.description}

                </p>
                <div className={classes.productBottomDetails} >
                    <div className={classes.productPrice}><small>${data.price}</small>${discountPrice(data.price, data.discountPercentage)}</div>
                    <div className={classes.productLinks}>
                        <a href="#" onClick={() => viewProductHandler(data.id)} ><i className="fa fa-eye"></i></a>
                        <a href="#" onClick={() => handleUpdateProduct(data)}><i className="fa fa-edit"></i></a>
                        <a href="#"><i className="fa fa-trash" onClick={() => onDelete ? onDelete(data.id) : null}></i></a>
                    </div>
                </div>
            </div>}
        </div>
    )
}

export default ProductCard;