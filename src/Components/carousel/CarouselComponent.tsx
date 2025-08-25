
import Carousel from 'react-multi-carousel';
import 'react-multi-carousel/lib/styles.css';
import ProductCard from '../ProductCard/ProductCard';
import { useSelector } from 'react-redux';

const responsive = {
    superLargeDesktop: {
        breakpoint: { max: 4000, min: 3000 },
        items: 7
    },
    desktop: {
        breakpoint: { max: 3000, min: 1024 },
        items: 7
    },
    tablet: {
        breakpoint: { max: 1024, min: 464 },
        items: 3
    },
    mobile: {
        breakpoint: { max: 464, min: 0 },
        items: 3
    }
};


const CarouselComponent = () => {
    const recentProducts = useSelector((state: any) => {
        return state.product.recentProducts
    });

    if (!recentProducts) {
        return <div></div>
    }
    return (
        <Carousel responsive={responsive}>
            {recentProducts.map((v: any) => {
                return (
                    <ProductCard data={v} showDscription={false} />
                )
            })}

        </Carousel>
    )
}

export default CarouselComponent;