import sys
import json
import pickle
import numpy as np

def load_model():
    with open( '../pickle_file/model_1yr.pkl','rb') as f:
        model = pickle.load(f)
    return model

def predict(model, features):
    features = np.array(features).reshape(1, -1)
    prediction = model.predict(features)
    return prediction

if __name__ == '__main__':
    features = json.loads(sys.argv[1])
    model = load_model()
    prediction = predict(model, features)
    print(prediction[0])
