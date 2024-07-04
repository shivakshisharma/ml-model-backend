import sys
import json
import pickle
import numpy as np
import logging
from sklearn.tree import DecisionTreeRegressor


# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

def load_model():
    try:
        with open('/Sinter RDI project files/ml-model-backend/pickle_file/model_1yr_new.pkl', 'rb') as f:
            model = pickle.load(f)
            logging.info("Model loaded successfully")
        return model
    except FileNotFoundError:
        logging.error("Model file not found.")
        return {"error": "Model file not found."}
    except Exception as e:
        logging.error(f"An error occurred while loading the model: {e}")
        return {"error": f"An error occurred while loading the model: {e}"}

def predict(model, features):
    try:
        features = np.array(features).reshape(1, -1)
        prediction = model.predict(features)
        logging.info(f"Prediction: {prediction}")
        return {"prediction": prediction[0]}
    except Exception as e:
        logging.error(f"An error occurred during prediction: {e}")
        return {"error": f"An error occurred during prediction: {e}"}

if __name__ == '__main__':
    if len(sys.argv) != 2:
        error_message = "Usage: python script.py '<features_json>'"
        logging.error(error_message)
        print(json.dumps({"error": error_message}))
        sys.exit(1)

    try:
        features = json.loads(sys.argv[1])
        if len(features) != 16:
            error_message = "Error: Features array must contain exactly 16 elements."
            logging.error(error_message)
            print(json.dumps({"error": error_message}))
            sys.exit(1)
    except json.JSONDecodeError:
        error_message = "Error: Invalid JSON format."
        logging.error(error_message)
        print(json.dumps({"error": error_message}))
        sys.exit(1)
    except Exception as e:
        error_message = f"An error occurred while parsing features: {e}"
        logging.error(error_message)
        print(json.dumps({"error": error_message}))
        sys.exit(1)

    model = load_model()
    if isinstance(model, dict) and "error" in model:
        print(json.dumps(model))
        sys.exit(1)
    
    train_features = ['-5mm', 'mean size Raw mix wet', '+40mm', 'FeO', 'MgO',
       'CI of coal \n85-90', 'CI of Lime\n85-90', 'CI of Dolomite\n85-90',
       'Basicity', 'Al2O3/SiO2', 'Main Fan Speed RPM', 'avg BTP\n400-450',
       'CaO', 'Balling Index\n1.55+', 'avg  F/C temp\n1150-1200',
       'M/C speed m/min']

    prediction = predict(model, features)
    print(json.dumps(prediction))
