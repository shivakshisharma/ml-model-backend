import sys
import json
import pickle
import numpy as np

def load_model():
    try:
        with open('/Sinter RDI project files/ml-model-backend/pickle_file', 'rb') as f:
            model = pickle.load(f)
        return model
    except FileNotFoundError:
        print("Model file not found.")
        sys.exit(1)
    except Exception as e:
        print(f"An error occurred while loading the model: {e}")
        sys.exit(1)

def predict(model, features):
    try:
        features = np.array(features).reshape(1, -1)
        prediction = model.predict(features)
        return prediction
    except Exception as e:
        print(f"An error occurred during prediction: {e}")
        sys.exit(1)

if __name__ == '__main__':
    if len(sys.argv) != 2:
        print("Usage: python script.py '<features_json>'")
        sys.exit(1)

    try:
        features = json.loads(sys.argv[1])
        if len(features) != 16:
            print("Error: Features array must contain exactly 16 elements.")
            sys.exit(1)
    except json.JSONDecodeError:
        print("Error: Invalid JSON format.")
        sys.exit(1)
    except Exception as e:
        print(f"An error occurred while parsing features: {e}")
        sys.exit(1)

    model = load_model()
    prediction = predict(model, features)
    print(prediction[0])
