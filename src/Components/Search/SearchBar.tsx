import React, { useState } from 'react';
import classes from './SearchBar.module.css'

type SearchBarProps = {
    serachFn: (key: string) => void;
    sortFn: (sortType: string) => void;
}


const SearchBar: React.FC<SearchBarProps> = ({ serachFn, sortFn }) => {
    return (
        <div className={classes.wrapper}>
            <div className={classes.container}>
                <div className={classes.searcForm}>
                    <label>
                        <span className={classes.screenReaderText}>Search for...</span>
                        <input type="search" className={classes.searchField} placeholder="Search with name..." name="s" title="" onChange={(e) =>  serachFn(e.target.value)} />
                    </label>
                    <button className={`${classes.searchSubmit} ${classes.button}`} onClick={() => sortFn('high')}>
                        <i className="fa fa-arrow-up"></i>
                    </button>
                    <button className={`${classes.searchSubmit} ${classes.button}`} onClick={() => sortFn('low')}>
                        <i className="fa fa-arrow-down"></i>
                    </button>
                    <button className={`${classes.searchSubmit} ${classes.button}`} onClick={() => sortFn('reset')}>
                        <i className="fa fa-refresh"></i>
                    </button>
                </div>
            </div>
        </div>
    )
}

export default SearchBar;