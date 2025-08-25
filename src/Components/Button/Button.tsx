import React from "react";
import classes from './Button.module.css'

interface ButtonProps {
    lable : string;
    onButtonClick: () => void;
    customClass?:string;
}

const Button: React.FC<ButtonProps> = ({ lable, onButtonClick,customClass }) => {
    return <div>
        <button type="button" className={customClass ? customClass :classes.button} onClick={() => onButtonClick()}  >{lable}</button>
    </div>
}

export default Button;