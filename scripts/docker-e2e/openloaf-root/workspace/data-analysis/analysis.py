import pandas as pd

def load_data(path: str) -> pd.DataFrame:
    return pd.read_csv(path)

if __name__ == "__main__":
    print("Data analysis module ready")
